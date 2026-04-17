import { z } from 'zod';

export const CreateDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  parentId: z.uuid().nullable().optional(),
});

export type CreateDepartmentDto = z.infer<typeof CreateDepartmentSchema>;
