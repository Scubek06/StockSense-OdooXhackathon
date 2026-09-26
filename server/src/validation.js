import { z } from 'zod';

const uuid = z.string().uuid();
const nonempty = (max) => z.string().trim().min(1).max(max);

export const registerSchema = z.object({
  name: nonempty(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128)
});
export const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128)
});
export const forgotSchema = z.object({ email: z.string().trim().email().max(254) });
export const resetSchema = z.object({
  email: z.string().trim().email().max(254),
  otp: z.string().regex(/^\d{6}$/, 'OTP must contain six digits.'),
  newPassword: z.string().min(8).max(128)
});
export const profileSchema = z.object({
  name: nonempty(120).optional(),
  email: z.string().trim().email().max(254).optional()
}).refine((value) => Object.keys(value).length > 0, 'Provide a name or email to update.');
export const categorySchema = z.object({
  name: nonempty(100),
  description: z.string().trim().max(1000).nullable().optional()
});
export const productSchema = z.object({
  name: nonempty(160),
  sku: nonempty(64),
  categoryId: uuid.nullable().optional(),
  unit: nonempty(24).optional(),
  reorderLevel: z.coerce.number().finite().min(0).max(99999999999.999).optional(),
  active: z.boolean().optional()
});
export const warehouseSchema = z.object({
  name: nonempty(120),
  code: nonempty(32),
  address: z.string().trim().max(500).nullable().optional()
});
export const locationSchema = z.object({
  warehouseId: uuid,
  name: nonempty(120),
  code: nonempty(32)
});
export const operationStatusSchema = z.object({ status: z.enum(['waiting', 'ready']) });
export const operationCommon = {
  reference: z.string().trim().max(100).nullable().optional(),
  partyName: z.string().trim().max(160).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  items: z.array(z.object({
    productId: uuid,
    quantity: z.coerce.number().finite().min(0).max(99999999999.999)
  })).min(1).max(500)
    .refine((items) => new Set(items.map((item) => item.productId)).size === items.length,
      'Each product may appear only once per operation.')
};

export function operationSchema(kind) {
  const locations = {
    receipt: { destinationLocationId: uuid },
    delivery: { sourceLocationId: uuid },
    transfer: { sourceLocationId: uuid, destinationLocationId: uuid },
    adjustment: { destinationLocationId: uuid }
  };
  const schema = z.object({ ...operationCommon, ...locations[kind] });
  if (kind === 'transfer') {
    return schema.refine((value) => value.sourceLocationId !== value.destinationLocationId,
      'Source and destination locations must be different.');
  }
  return schema;
}

export function validateBody(schema) {
  return (request, _response, next) => {
    const result = schema.safeParse(request.body);
    if (!result.success) {
      const error = new Error(result.error.issues.map((issue) => issue.message).join(' '));
      error.status = 400;
      error.expose = true;
      return next(error);
    }
    request.body = result.data;
    return next();
  };
}
