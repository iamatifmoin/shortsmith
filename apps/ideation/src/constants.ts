/**
 * Pipeline queue names. Each ideation stage is a BullMQ queue; a row walks the
 * pipeline as jobs are enqueued onto the next stage. See docs/architecture.md.
 */
export const QUEUES = {
  HARVEST: 'harvest',
  EXTRACT: 'extract',
  RANK: 'rank',
  GENERATE: 'generate',
  // Phase 3: approving a Script (Gate 1) enqueues a render here; the separate
  // apps/render worker consumes it (ADR-021). Keep this literal in sync with
  // apps/render/src/constants.ts.
  RENDER: 'render',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
