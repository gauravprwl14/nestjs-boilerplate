import 'reflect-metadata';
import { HttpStatus } from '@nestjs/common';
import { ApiEndpoint } from '@common/decorators/api-endpoint.decorator';

/**
 * Helper to read Reflect metadata from a method descriptor.
 */
function getMetadataForMethod(
  target: object,
  methodName: string,
  metadataKey: string,
): unknown {
  return Reflect.getMetadata(metadataKey, target, methodName);
}

/**
 * Test controller to apply the decorator to.
 */
class TestController {
  @ApiEndpoint({ summary: 'Get all items' })
  async getAll(): Promise<void> {}

  @ApiEndpoint({
    summary: 'Create item',
    successStatus: HttpStatus.CREATED,
    successDescription: 'Item created',
    errorResponses: [HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED],
  })
  async createItem(): Promise<void> {}

  @ApiEndpoint({
    summary: 'Delete item',
    successStatus: HttpStatus.NO_CONTENT,
    description: 'Permanently deletes the item',
    errorResponses: [HttpStatus.NOT_FOUND, HttpStatus.FORBIDDEN],
  })
  async deleteItem(): Promise<void> {}
}

describe('ApiEndpoint decorator', () => {
  describe('basic application', () => {
    it('should apply without throwing when minimal options provided', () => {
      // --- ASSERT ---
      // If the decorator threw during class definition, this test would not run
      expect(TestController.prototype.getAll).toBeDefined();
    });

    it('should apply without throwing when all options provided', () => {
      // --- ASSERT ---
      expect(TestController.prototype.createItem).toBeDefined();
    });
  });

  describe('HTTP code metadata', () => {
    it('should set HTTP code to 200 (OK) by default', () => {
      // --- ARRANGE ---
      const httpCodeKey = '__httpCode__';
      const metadata = Reflect.getMetadata(httpCodeKey, TestController.prototype.getAll);

      // --- ASSERT ---
      // HttpCode decorator stores the code on the method
      expect(metadata).toBe(HttpStatus.OK);
    });

    it('should set HTTP code to CREATED (201) when successStatus is CREATED', () => {
      // --- ARRANGE ---
      const httpCodeKey = '__httpCode__';
      const metadata = Reflect.getMetadata(httpCodeKey, TestController.prototype.createItem);

      // --- ASSERT ---
      expect(metadata).toBe(HttpStatus.CREATED);
    });

    it('should set HTTP code to NO_CONTENT (204) when successStatus is NO_CONTENT', () => {
      // --- ARRANGE ---
      const httpCodeKey = '__httpCode__';
      const metadata = Reflect.getMetadata(httpCodeKey, TestController.prototype.deleteItem);

      // --- ASSERT ---
      expect(metadata).toBe(HttpStatus.NO_CONTENT);
    });
  });

  describe('Swagger metadata', () => {
    it('should set ApiOperation summary metadata', () => {
      // --- ARRANGE ---
      const swaggerKey = 'swagger/apiOperation';
      const metadata = Reflect.getMetadata(swaggerKey, TestController.prototype.getAll);

      // --- ASSERT ---
      expect(metadata).toBeDefined();
      expect(metadata.summary).toBe('Get all items');
    });

    it('should set ApiOperation description when provided', () => {
      // --- ARRANGE ---
      const swaggerKey = 'swagger/apiOperation';
      const metadata = Reflect.getMetadata(swaggerKey, TestController.prototype.deleteItem);

      // --- ASSERT ---
      expect(metadata).toBeDefined();
      expect(metadata.description).toBe('Permanently deletes the item');
    });
  });

  describe('decorator function signature', () => {
    it('should be a function that returns a MethodDecorator', () => {
      // --- ASSERT ---
      expect(typeof ApiEndpoint).toBe('function');
      const result = ApiEndpoint({ summary: 'Test' });
      expect(typeof result).toBe('function');
    });

    it('should accept errorResponses array without throwing', () => {
      // --- ASSERT ---
      expect(() => {
        ApiEndpoint({
          summary: 'Test',
          errorResponses: [
            HttpStatus.BAD_REQUEST,
            HttpStatus.UNAUTHORIZED,
            HttpStatus.FORBIDDEN,
            HttpStatus.NOT_FOUND,
            HttpStatus.CONFLICT,
            HttpStatus.TOO_MANY_REQUESTS,
            HttpStatus.INTERNAL_SERVER_ERROR,
          ],
        });
      }).not.toThrow();
    });

    it('should use default values when optional options are omitted', () => {
      // --- ARRANGE ---
      class MinimalController {
        @ApiEndpoint({ summary: 'Minimal' })
        async action(): Promise<void> {}
      }

      // --- ASSERT ---
      const httpCodeKey = '__httpCode__';
      const metadata = Reflect.getMetadata(httpCodeKey, MinimalController.prototype.action);
      expect(metadata).toBe(HttpStatus.OK);
    });
  });
});
