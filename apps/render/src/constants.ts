/**
 * Queue names for the render worker. `render` MUST match
 * apps/ideation/src/constants.ts QUEUES.RENDER — that's where jobs are enqueued
 * when a Script is approved at Gate 1 (ADR-021).
 */
export const QUEUES = {
  RENDER: 'render',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
