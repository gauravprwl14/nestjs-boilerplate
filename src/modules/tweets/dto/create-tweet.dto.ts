import { z } from 'zod';
import { MAX_TWEET_CONTENT_LENGTH } from '@common/constants';

export const TweetVisibilityEnum = z.enum([
  'COMPANY',
  'DEPARTMENTS',
  'DEPARTMENTS_AND_SUBDEPARTMENTS',
]);

export const CreateTweetSchema = z
  .object({
    content: z.string().trim().min(1).max(MAX_TWEET_CONTENT_LENGTH),
    visibility: TweetVisibilityEnum,
    departmentIds: z.array(z.string().uuid()).optional(),
  })
  .refine(
    d =>
      d.visibility === 'COMPANY' || (Array.isArray(d.departmentIds) && d.departmentIds.length > 0),
    {
      message:
        'departmentIds is required when visibility is DEPARTMENTS or DEPARTMENTS_AND_SUBDEPARTMENTS',
      path: ['departmentIds'],
    },
  );

export type CreateTweetDto = z.infer<typeof CreateTweetSchema>;
