import { Injectable, PipeTransform, ArgumentMetadata } from '@nestjs/common';
import { ZodSchema } from 'zod';
import { ErrorFactory } from '@errors/types/error-factory';

/**
 * Pipe that validates incoming data against a Zod schema.
 *
 * Throws a VAL0001 AppError with per-field details on validation failure.
 *
 * @example
 * ```typescript
 * @Body(new ZodValidationPipe(CreateUserSchema))
 * body: CreateUserDto
 * ```
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw ErrorFactory.fromZodErrors(result.error);
    }

    return result.data;
  }
}
