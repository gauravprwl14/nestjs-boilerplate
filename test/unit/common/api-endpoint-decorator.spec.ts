import 'reflect-metadata';
import { HttpStatus } from '@nestjs/common';
import { ApiEndpoint } from '@common/decorators/api-endpoint.decorator';

/**
 * Tests for the composite @ApiEndpoint decorator. We verify the observable
 * behaviour — that @HttpCode metadata is applied and that the factory works
 * without throwing for the full matrix of optional knobs. We intentionally
 * do not pin the internal Swagger metadata keys.
 */
describe('ApiEndpoint decorator', () => {
  describe('HttpCode metadata', () => {
    const httpCodeKey = '__httpCode__';

    it('defaults to HTTP 200 when successStatus is omitted', () => {
      // --- ARRANGE ---
      class Ctl {
        @ApiEndpoint({ summary: 'List' })
        list(): void {}
      }

      // --- ACT ---
      const code = Reflect.getMetadata(httpCodeKey, Ctl.prototype.list);

      // --- ASSERT ---
      expect(code).toBe(HttpStatus.OK);
    });

    it('uses the provided successStatus for @HttpCode', () => {
      // --- ARRANGE ---
      class Ctl {
        @ApiEndpoint({ summary: 'Create', successStatus: HttpStatus.CREATED })
        create(): void {}

        @ApiEndpoint({ summary: 'Delete', successStatus: HttpStatus.NO_CONTENT })
        remove(): void {}
      }

      // --- ACT & ASSERT ---
      expect(Reflect.getMetadata(httpCodeKey, Ctl.prototype.create)).toBe(HttpStatus.CREATED);
      expect(Reflect.getMetadata(httpCodeKey, Ctl.prototype.remove)).toBe(HttpStatus.NO_CONTENT);
    });
  });

  describe('factory shape', () => {
    it('returns a MethodDecorator function', () => {
      // --- ACT ---
      const decorator = ApiEndpoint({ summary: 'Test' });

      // --- ASSERT ---
      expect(typeof decorator).toBe('function');
    });

    it('accepts the full option matrix without throwing', () => {
      // --- ASSERT ---
      expect(() =>
        ApiEndpoint({
          summary: 'All the knobs',
          description: 'A long description',
          successStatus: HttpStatus.ACCEPTED,
          successDescription: 'Accepted',
          errorResponses: [
            HttpStatus.BAD_REQUEST,
            HttpStatus.UNAUTHORIZED,
            HttpStatus.FORBIDDEN,
            HttpStatus.NOT_FOUND,
            HttpStatus.CONFLICT,
            HttpStatus.TOO_MANY_REQUESTS,
            HttpStatus.INTERNAL_SERVER_ERROR,
          ],
        }),
      ).not.toThrow();
    });

    it('tolerates an unknown error status (falls back to generic description)', () => {
      // --- ASSERT ---
      expect(() =>
        ApiEndpoint({ summary: 'Odd', errorResponses: [418 as HttpStatus] }),
      ).not.toThrow();
    });
  });
});
