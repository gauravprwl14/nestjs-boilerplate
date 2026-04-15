import { handlePrismaError, isPrismaError } from '@errors/handlers/prisma-error.handler';

/**
 * Method decorator that catches Prisma errors and converts them to ErrorException.
 * Apply to repository methods to ensure consistent DB error handling across
 * the persistence layer without repeating try/catch boilerplate.
 *
 * When a Prisma error is caught:
 * - Known errors (P2002, P2025, etc.) are mapped to typed ErrorException instances.
 * - Unknown Prisma errors fall back to a generic DAT.QUERY_FAILED ErrorException.
 * - Non-Prisma errors are re-thrown unchanged.
 *
 * @returns A MethodDecorator that wraps the decorated method
 *
 * @example
 * ```typescript
 * @CatchDbError()
 * async findByEmail(email: string): Promise<User | null> {
 *   return this.prisma.user.findUnique({ where: { email } });
 * }
 * ```
 */
export function CatchDbError(): MethodDecorator {
  return function (
    _target: any,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      try {
        return await originalMethod.apply(this, args);
      } catch (error) {
        if (isPrismaError(error)) {
          const errorException = handlePrismaError(error);
          if (errorException) throw errorException;
        }
        throw error;
      }
    };

    return descriptor;
  };
}
