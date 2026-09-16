import { afterEach, describe, expect, it, vi } from 'vitest'
import { SharedControlReconnectScheduler } from './remote-runtime-shared-control-reconnect'

afterEach(() => {
  vi.useRealTimers()
})

describe('SharedControlReconnectScheduler', () => {
  it('advances one pending backoff without leaving its timer armed', async () => {
    vi.useFakeTimers()
    const scheduler = new SharedControlReconnectScheduler()
    const open = vi.fn()
    scheduler.schedule({ intentionallyClosed: false, delaysMs: [30_000], open })

    expect(scheduler.retryNow()).toBe(true)
    expect(scheduler.retryNow()).toBe(false)
    expect(open).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(30_000)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('stops reconnecting once the environment is gone from the store', () => {
    vi.useFakeTimers()
    const scheduler = new SharedControlReconnectScheduler()
    const open = vi.fn()

    scheduler.scheduleAfterSocketClose({
      intentionallyClosed: false,
      manuallyDisconnected: false,
      environmentRemoved: () => true,
      capabilityPaused: false,
      subscriptionCount: 1,
      open
    })

    expect(scheduler.isScheduled).toBe(false)
    vi.advanceTimersByTime(300_000)
    expect(open).not.toHaveBeenCalled()
  })

  it('keeps reconnecting a subscribed socket while the environment is still stored', () => {
    vi.useFakeTimers()
    const scheduler = new SharedControlReconnectScheduler()
    const open = vi.fn()

    scheduler.scheduleAfterSocketClose({
      intentionallyClosed: false,
      manuallyDisconnected: false,
      environmentRemoved: () => false,
      capabilityPaused: false,
      subscriptionCount: 1,
      open
    })

    expect(scheduler.isScheduled).toBe(true)
    vi.advanceTimersByTime(300_000)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('drops a pending reconnect when the environment is removed during its backoff', () => {
    vi.useFakeTimers()
    const scheduler = new SharedControlReconnectScheduler()
    const open = vi.fn()
    let environmentRemoved = false

    scheduler.scheduleAfterSocketClose({
      intentionallyClosed: false,
      manuallyDisconnected: false,
      environmentRemoved: () => environmentRemoved,
      capabilityPaused: false,
      subscriptionCount: 1,
      open
    })
    expect(scheduler.isScheduled).toBe(true)

    // Why mid-wait: the verdict taken before the backoff said "still stored".
    environmentRemoved = true
    vi.advanceTimersByTime(300_000)

    expect(open).not.toHaveBeenCalled()
  })

  it('does not advance cleared or intentionally closed work', () => {
    vi.useFakeTimers()
    const scheduler = new SharedControlReconnectScheduler()
    const open = vi.fn()
    scheduler.schedule({ intentionallyClosed: false, delaysMs: [30_000], open })
    scheduler.clear()

    expect(scheduler.retryNow()).toBe(false)

    scheduler.schedule({ intentionallyClosed: true, delaysMs: [30_000], open })
    expect(scheduler.retryNow()).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })
})
