import { describe, expect, it } from 'vitest'
import { collectSalvageDrops } from '../../../src/shared/zod-salvage'
import { gitHistoryResultSchema } from './git-history-reply-schema'
import { gitStatusHostPayloadSchema, gitStatusProjectionSchema } from './git-status-reply-schema'
import { hostedReviewEligibilitySchema } from './hosted-review-reply-schema'

// Four properties of these schemas that no consumer trace predicts and the reply-matrix goldens
// found. Each one cost a golden; each one is a way a schema silently breaks a working screen.

describe('source-control reply schemas', () => {
  it('decodes a reply from a host that sends members this client does not declare', () => {
    // The whole point of not using `.strict()`. Under it the top-level member rejects the reply
    // and the entry member drops the row, which empties a dirty worktree's Changes list.
    const fromNewerHost = {
      entries: [
        { path: 'src/app.ts', status: 'modified', area: 'staged', submoduleRoot: 'vendor/x' }
      ],
      conflictOperation: 'unknown',
      branch: 'feature',
      didHitLimit: false
    }
    const parsed = gitStatusHostPayloadSchema.safeParse(fromNewerHost)
    expect(parsed.success).toBe(true)
    expect(parsed.data?.entries).toHaveLength(1)
    expect(parsed.data?.entries[0]?.submoduleRoot).toBe('vendor/x')
    expect(parsed.data?.didHitLimit).toBe(false)
  })

  it('keeps a commit whose timestamp the host sent as null', () => {
    // `z.number().optional()` drops the row instead, because null is neither.
    const parsed = gitHistoryResultSchema.safeParse({
      items: [{ id: 'a'.repeat(40), parentIds: [], subject: '', timestamp: null }]
    })
    expect(parsed.data?.items).toHaveLength(1)
  })

  it('passes an eligibility token through that the shared union does not list', () => {
    // The host publishes `reviewLookupOutcome: 'none'`, which HostedReviewLookupOutcome omits.
    const parsed = hostedReviewEligibilitySchema.safeParse({
      provider: 'gitlab',
      reviewLookupOutcome: 'none'
    })
    expect(parsed.data?.reviewLookupOutcome).toBe('none')
  })

  it('writes every projected member out, absent ones included', () => {
    // The projection is built by hand upstream of this schema's consumers, so an absent member is
    // a present `undefined`. zod's own optional-key omission would change what the goldens record.
    const projected = gitStatusProjectionSchema.parse({
      entries: [{ path: 'src/app.ts', status: 'modified', area: 'staged' }]
    })
    expect(projected && Object.keys(projected).sort()).toEqual([
      'branch',
      'conflictOperation',
      'entries',
      'head',
      'upstreamStatus'
    ])
    expect(projected?.entries[0] && Object.keys(projected.entries[0]).sort()).toEqual([
      'added',
      'area',
      'conflictKind',
      'conflictStatus',
      'conflictStatusSource',
      'oldPath',
      'path',
      'removed',
      'status'
    ])
  })

  it('reports a dropped entry instead of thinning the list in silence', () => {
    const salvaged = collectSalvageDrops(() =>
      gitStatusHostPayloadSchema.safeParse({
        entries: [{ path: 'src/app.ts', status: 'modified', area: 'staged' }, { path: 42 }]
      })
    )
    expect(salvaged.value.success).toBe(true)
    expect(salvaged.droppedCount).toBe(1)
    expect(salvaged.droppedPaths).toEqual(['1'])
  })
})
