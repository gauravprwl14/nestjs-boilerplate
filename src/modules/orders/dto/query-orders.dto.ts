import { z } from 'zod';

export const queryOrdersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type QueryOrdersDto = z.infer<typeof queryOrdersSchema>;
