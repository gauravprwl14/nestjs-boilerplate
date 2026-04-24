import { z } from 'zod';

const shippingAddressSchema = z.object({
  name: z.string().min(1).max(100),
  line1: z.string().min(1).max(255),
  city: z.string().min(1).max(100),
  state: z.string().min(2).max(50),
  pincode: z.string().regex(/^\d{6}$/),
  country: z.string().length(2).default('IN'),
});

const orderItemSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().positive().max(100),
});

export const createOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1).max(20),
  shippingAddress: shippingAddressSchema,
  paymentMethod: z.enum(['credit_card', 'upi', 'cod', 'wallet']),
  paymentLast4: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  couponCode: z.string().max(50).optional(),
});

export type CreateOrderDto = z.infer<typeof createOrderSchema>;
