import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { encodePairingOffer } from '../../shared/pairing'
import {
  addEnvironmentFromPairingCode,
  getEnvironmentStorePath,
  removeEnvironment
} from '../../shared/runtime-environment-store'
import {
  isRuntimeEnvironmentRemoved,
  noteRuntimeEnvironmentStored,
  retireRemovedRuntimeEnvironment,
  setRuntimeEnvironmentRemovalWatch
} from './runtime-environment-removal-watch'

const tempDirs: string[] = []

function createStore(): { userDataPath: string; environmentId: string } {
  const userDataPath = mkdtempSync(join(tmpdir(), 'orca-removal-watch-'))
  tempDirs.push(userDataPath)
  const environment = addEnvironmentFromPairingCode(userDataPath, {
    name: 'desk',
    pairingCode: encodePairingOffer({
      v: 2,
      endpoint: 'ws://127.0.0.1:6768',
      deviceToken: 'device-token',
      publicKeyB64: Buffer.from(new Uint8Array(32).fill(1)).toString('base64')
    })
  })
  return { userDataPath, environmentId: environment.id }
}

afterEach(() => {
  setRuntimeEnvironmentRemovalWatch(null)
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('runtime environment removal watch', () => {
  it('reports a stored environment as present', () => {
    const { userDataPath, environmentId } = createStore()
    setRuntimeEnvironmentRemovalWatch({ getUserDataPath: () => userDataPath, retire: vi.fn() })

    expect(isRuntimeEnvironmentRemoved(environmentId)).toBe(false)
  })

  it('never judges an environment the watched store has never listed', () => {
    const { userDataPath } = createStore()
    setRuntimeEnvironmentRemovalWatch({ getUserDataPath: () => userDataPath, retire: vi.fn() })

    // Why: an id resolved from another user-data path is absent here for reasons unrelated to removal.
    expect(isRuntimeEnvironmentRemoved('environment-from-another-path')).toBe(false)
  })

  it('reports an environment the CLI removed from the store', () => {
    const { userDataPath, environmentId } = createStore()
    setRuntimeEnvironmentRemovalWatch({ getUserDataPath: () => userDataPath, retire: vi.fn() })
    noteRuntimeEnvironmentStored(environmentId)
    removeEnvironment(userDataPath, environmentId)

    expect(isRuntimeEnvironmentRemoved(environmentId)).toBe(true)
  })

  it('forgets recorded environments when the watch is replaced', () => {
    const { userDataPath, environmentId } = createStore()
    setRuntimeEnvironmentRemovalWatch({ getUserDataPath: () => userDataPath, retire: vi.fn() })
    noteRuntimeEnvironmentStored(environmentId)
    removeEnvironment(userDataPath, environmentId)
    setRuntimeEnvironmentRemovalWatch({ getUserDataPath: () => userDataPath, retire: vi.fn() })

    expect(isRuntimeEnvironmentRemoved(environmentId)).toBe(false)
  })

  it('treats a missing store as unknown rather than removed', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'orca-removal-watch-'))
    tempDirs.push(userDataPath)
    setRuntimeEnvironmentRemovalWatch({ getUserDataPath: () => userDataPath, retire: vi.fn() })

    expect(isRuntimeEnvironmentRemoved('environment-a')).toBe(false)
  })

  it('treats an unreadable store as unknown rather than removed', () => {
    const { userDataPath, environmentId } = createStore()
    // Why: an unclean exit can leave the store NUL-filled (#18766); that must not retire anything.
    writeFileSync(getEnvironmentStorePath(userDataPath), Buffer.alloc(64))
    setRuntimeEnvironmentRemovalWatch({ getUserDataPath: () => userDataPath, retire: vi.fn() })

    expect(isRuntimeEnvironmentRemoved(environmentId)).toBe(false)
  })

  it('answers present and retires nothing before a watch is installed', () => {
    expect(isRuntimeEnvironmentRemoved('environment-a')).toBe(false)
    expect(() => retireRemovedRuntimeEnvironment('environment-a')).not.toThrow()
  })

  it('retires a removed environment through the injected teardown', () => {
    const { userDataPath } = createStore()
    const retire = vi.fn().mockResolvedValue(undefined)
    setRuntimeEnvironmentRemovalWatch({ getUserDataPath: () => userDataPath, retire })

    retireRemovedRuntimeEnvironment('environment-a')

    expect(retire).toHaveBeenCalledWith('environment-a')
  })

  it('survives a teardown that rejects', async () => {
    const { userDataPath } = createStore()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setRuntimeEnvironmentRemovalWatch({
      getUserDataPath: () => userDataPath,
      retire: () => Promise.reject(new Error('teardown failed'))
    })

    retireRemovedRuntimeEnvironment('environment-a')
    await Promise.resolve()

    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
