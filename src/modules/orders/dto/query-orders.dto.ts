import { z } from 'zod';

/**
 * Zod validation schema for the list-orders query string.
 *
 * Both fields are coerced from strings (query params arrive as strings) to
 * integers before validation. Defaults allow callers to omit either field.
 */
export const queryOrdersSchema = z.object({
  /** Page number (1-indexed); defaults to 1 when omitted. */
  page: z.coerce.number().int().positive().default(1),
  /** Number of orders per page; 1–100; defaults to 20. */
  limit: z.coerce.number().int().positive().max(100).default(20),
});

/**
 * TypeScript type inferred from {@link queryOrdersSchema}.
 * Use this as the parameter type for paginated order list handlers.
 */
export type QueryOrdersDto = z.infer<typeof queryOrdersSchema>;
