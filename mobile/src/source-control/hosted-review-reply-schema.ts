import { z } from 'zod'
import { openEnum, salvagedOptional } from '../../../src/shared/zod-salvage'

// `hostedReview.getCreationEligibility` and `hostedReview.create`. Checked against
// HostedReviewCreationEligibility and CreateHostedReviewResult in src/shared/hosted-review.ts,
// which src/main/runtime/rpc/methods/hosted-review.ts:31-57 returns from the runtime service
// verbatim. Both answer in-band, so an accepted reply can still say no.

const HOSTED_REVIEW_PROVIDER = [
  'github',
  'gitlab',
  'bitbucket',
  'azure-devops',
  'gitea',
  'unsupported'
] as const

/**
 * Creation eligibility.
 *
 * `provider` is the one required member: mobile-hosted-review-service.ts:120 puts it in the
 * prefill's required `provider` slot, and hostedReviewCopy() routes the whole compose form's copy
 * off it. Everything on :121-126 is read through `||` or lands in an optional prefill slot.
 *
 * The three routing tokens are strings, not the shared type's closed unions, because the host's
 * vocabulary is already wider than the type: the recorded `sc-eligibility-fetched` reply carries
 * `reviewLookupOutcome: 'none'`, which HostedReviewLookupOutcome does not list. Mobile only ever
 * compares them to a handful of literals, so passing an unrecognised token through is both what
 * main did and what keeps a newer host from blocking create on this screen.
 */
export const hostedReviewEligibilitySchema = z.looseObject({
  provider: openEnum(HOSTED_REVIEW_PROVIDER, 'unsupported'),
  canCreate: salvagedOptional('canCreate', z.boolean()),
  blockedReason: salvagedOptional('blockedReason', z.string().nullable()),
  nextAction: salvagedOptional('nextAction', z.string().nullable()),
  reviewLookupOutcome: salvagedOptional('reviewLookupOutcome', z.string()),
  defaultBaseRef: salvagedOptional('defaultBaseRef', z.string().nullable()),
  title: salvagedOptional('title', z.string().nullable()),
  body: salvagedOptional('body', z.string().nullable())
})

const hostedReviewSummarySchema = z.looseObject({ url: z.string(), number: z.number().optional() })

/**
 * Creation outcome, declared as the host's own two arms.
 *
 * The success arm requires `number` and `url` because :262 hands both to the link step, which
 * writes `number` into worktree metadata. The failure arm requires `error`: :205 returns it as the
 * form's message and :208 calls `.replace` on it, which is where main threw a TypeError on a
 * refusal that omitted it. `existingReview` is probed with `?.` on :264, so it stays optional.
 */
export const hostedReviewCreateOkSchema = z.looseObject({
  ok: z.literal(true),
  number: z.number(),
  url: z.string()
})

export const hostedReviewCreateFailedSchema = z.looseObject({
  ok: z.literal(false),
  error: z.string(),
  code: z.string().optional(),
  existingReview: salvagedOptional('existingReview', hostedReviewSummarySchema)
})

export type MobileHostedReviewEligibilityReply = z.output<typeof hostedReviewEligibilitySchema>
export type MobileHostedReviewCreateOk = z.output<typeof hostedReviewCreateOkSchema>
export type MobileHostedReviewCreateFailed = z.output<typeof hostedReviewCreateFailedSchema>
