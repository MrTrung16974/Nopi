import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  checks: z.record(z.string(), z.enum(['up', 'down'])),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
