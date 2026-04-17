import { TweetsController } from '@modules/tweets/tweets.controller';
import { CreateTweetDto, CreateTweetSchema } from '@modules/tweets/dto/create-tweet.dto';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { ErrorException } from '@errors/types/error-exception';
import { MAX_TWEET_CONTENT_LENGTH } from '@common/constants';

/**
 * Controller-level unit tests.
 *
 * The controller is a thin HTTP wrapper. These specs cover:
 *   1. Routing / parameter plumbing — service called with the validated DTO.
 *   2. Return contract — the controller returns exactly what the service returns
 *      (the TransformInterceptor wraps it separately and is covered elsewhere).
 *   3. DTO validation — we instantiate the same ZodValidationPipe the controller
 *      wires via `@UsePipes(...)` so both layers stay in sync.
 */
describe('TweetsController', () => {
  const VALID_DEPT_UUID = '11111111-1111-4111-8111-111111111111';
  let service: {
    create: jest.Mock;
    timeline: jest.Mock;
  };
  let controller: TweetsController;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      timeline: jest.fn(),
    };
    controller = new TweetsController(service as any);
  });

  describe('POST /tweets (create)', () => {
    it('should delegate to service.create with the full DTO for COMPANY visibility', async () => {
      // --- ARRANGE ---
      const dto: CreateTweetDto = { content: 'hello', visibility: 'COMPANY' };
      const created = {
        id: 't1',
        companyId: 'c1',
        authorId: 'u1',
        content: 'hello',
        visibility: 'COMPANY',
        createdAt: new Date('2026-01-01'),
      };
      service.create.mockResolvedValueOnce(created);

      // --- ACT ---
      const result = await controller.create(dto);

      // --- ASSERT ---
      expect(service.create).toHaveBeenCalledWith(dto);
      expect(service.create).toHaveBeenCalledTimes(1);
      expect(result).toBe(created);
    });

    it('should delegate to service.create with departmentIds for DEPARTMENTS visibility', async () => {
      // --- ARRANGE ---
      const dto: CreateTweetDto = {
        content: 'sub',
        visibility: 'DEPARTMENTS',
        departmentIds: [VALID_DEPT_UUID],
      };
      service.create.mockResolvedValueOnce({ id: 't2' });

      // --- ACT ---
      await controller.create(dto);

      // --- ASSERT ---
      expect(service.create).toHaveBeenCalledWith(dto);
    });

    it('should propagate service errors (e.g. VAL0008 cross-tenant dept)', async () => {
      // --- ARRANGE ---
      const err = new Error('cross-tenant');
      service.create.mockRejectedValueOnce(err);

      // --- ACT + ASSERT ---
      await expect(
        controller.create({
          content: 'x',
          visibility: 'DEPARTMENTS',
          departmentIds: [VALID_DEPT_UUID],
        } as CreateTweetDto),
      ).rejects.toBe(err);
    });
  });

  describe('GET /timeline', () => {
    it('should delegate to service.timeline and return the mapped rows', async () => {
      // --- ARRANGE ---
      const rows = [
        {
          id: 't1',
          authorId: 'u1',
          content: 'hi',
          visibility: 'COMPANY' as const,
          createdAt: new Date('2026-01-01'),
        },
      ];
      service.timeline.mockResolvedValueOnce(rows);

      // --- ACT ---
      const result = await controller.timeline();

      // --- ASSERT ---
      expect(service.timeline).toHaveBeenCalledWith();
      expect(result).toBe(rows);
    });

    it('should return an empty array when the service has nothing to show', async () => {
      // --- ARRANGE ---
      service.timeline.mockResolvedValueOnce([]);

      // --- ACT ---
      const result = await controller.timeline();

      // --- ASSERT ---
      expect(result).toEqual([]);
    });
  });

  describe('DTO validation (ZodValidationPipe wired on POST)', () => {
    const pipe = new ZodValidationPipe(CreateTweetSchema);

    it('should accept a valid COMPANY payload', () => {
      // --- ACT ---
      const out = pipe.transform({ content: 'hi', visibility: 'COMPANY' }, {} as any);

      // --- ASSERT ---
      expect(out).toEqual({ content: 'hi', visibility: 'COMPANY' });
    });

    it('should accept a valid DEPARTMENTS payload with uuid ids', () => {
      // --- ACT ---
      const out = pipe.transform(
        {
          content: 'sub',
          visibility: 'DEPARTMENTS',
          departmentIds: [VALID_DEPT_UUID],
        },
        {} as any,
      );

      // --- ASSERT ---
      expect(out).toEqual({
        content: 'sub',
        visibility: 'DEPARTMENTS',
        departmentIds: [VALID_DEPT_UUID],
      });
    });

    it('should reject empty content', () => {
      // --- ACT + ASSERT ---
      expect(() => pipe.transform({ content: '', visibility: 'COMPANY' }, {} as any)).toThrow(
        ErrorException,
      );
    });

    it('should reject content that exceeds the max length', () => {
      // --- ARRANGE ---
      const tooLong = 'x'.repeat(MAX_TWEET_CONTENT_LENGTH + 1);

      // --- ACT + ASSERT ---
      expect(() => pipe.transform({ content: tooLong, visibility: 'COMPANY' }, {} as any)).toThrow(
        ErrorException,
      );
    });

    it('should reject an unknown visibility value', () => {
      // --- ACT + ASSERT ---
      expect(() => pipe.transform({ content: 'hi', visibility: 'PRIVATE' }, {} as any)).toThrow(
        ErrorException,
      );
    });

    it('should reject DEPARTMENTS visibility with no departmentIds (schema refine)', () => {
      // --- ACT + ASSERT ---
      expect(() => pipe.transform({ content: 'hi', visibility: 'DEPARTMENTS' }, {} as any)).toThrow(
        ErrorException,
      );
    });

    it('should reject DEPARTMENTS visibility with an empty departmentIds array', () => {
      // --- ACT + ASSERT ---
      expect(() =>
        pipe.transform({ content: 'hi', visibility: 'DEPARTMENTS', departmentIds: [] }, {} as any),
      ).toThrow(ErrorException);
    });

    it('should reject non-uuid entries in departmentIds', () => {
      // --- ACT + ASSERT ---
      expect(() =>
        pipe.transform(
          {
            content: 'hi',
            visibility: 'DEPARTMENTS_AND_SUBDEPARTMENTS',
            departmentIds: ['not-a-uuid'],
          },
          {} as any,
        ),
      ).toThrow(ErrorException);
    });

    it('should trim whitespace on content before validation', () => {
      // --- ACT ---
      const out = pipe.transform({ content: '   hello   ', visibility: 'COMPANY' }, {} as any) as {
        content: string;
      };

      // --- ASSERT ---
      expect(out.content).toBe('hello');
    });
  });
});
