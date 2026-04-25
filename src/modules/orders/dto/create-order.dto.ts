import { z } from 'zod';

/**
 * Zod schema for a shipping address.
 *
 * Constraints:
 * - `pincode` must be exactly 6 decimal digits (Indian postal code format)
 * - `country` is a 2-character ISO country code; defaults to 'IN'
 * - `state` accepts both 2-char abbreviations and full state names (max 50 chars)
 */
const shippingAddressSchema = z.object({
  /** Recipient full name, 1–100 characters. */
  name: z.string().min(1).max(100),
  /** Street address line 1, 1–255 characters. */
  line1: z.string().min(1).max(255),
  /** City name, 1–100 characters. */
  city: z.string().min(1).max(100),
  /** State or province, 2–50 characters. */
  state: z.string().min(2).max(50),
  /** Exactly 6 decimal digits — Indian PIN code format. */
  pincode: z.string().regex(/^\d{6}$/),
  /** ISO 3166-1 alpha-2 country code; defaults to 'IN'. */
  country: z.string().length(2).default('IN'),
});

/**
 * Zod schema for a single line item in a new order.
 *
 * Constraints:
 * - `productId` must be a positive integer (references the products catalogue)
 * - `quantity` is capped at 100 units per line to prevent bulk-order abuse
 */
const orderItemSchema = z.object({
  /** Positive integer referencing the product catalogue entry. */
  productId: z.number().int().positive(),
  /** Number of units ordered; 1–100 per line item. */
  quantity: z.number().int().positive().max(100),
});

/**
 * Zod validation schema for the Create Order request body.
 *
 * Business rules enforced here:
 * - At least 1 item, maximum 20 line items per order
 * - `paymentLast4` is only meaningful for card payments; it is optional but
 *   must be exactly 4 digits when provided
 * - `couponCode` is stored verbatim; discount computation happens server-side
 */
export const createOrderSchema = z.object({
  /** Array of line items; between 1 and 20 entries. */
  items: z.array(orderItemSchema).min(1).max(20),
  /** Delivery address validated against the shipping address constraints. */
  shippingAddress: shippingAddressSchema,
  /** Payment method — one of: credit_card, upi, cod, wallet. */
  paymentMethod: z.enum(['credit_card', 'upi', 'cod', 'wallet']),
  /**
   * Last 4 digits of the payment card.
   * Exactly 4 decimal digits when provided; omit for non-card methods.
   */
  paymentLast4: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  /** Promotional coupon code, max 50 characters. */
  couponCode: z.string().max(50).optional(),
});

/**
 * TypeScript type inferred from {@link createOrderSchema}.
 * Use this as the parameter type in service methods that accept order creation data.
 */
export type CreateOrderDto = z.infer<typeof createOrderSchema>;
