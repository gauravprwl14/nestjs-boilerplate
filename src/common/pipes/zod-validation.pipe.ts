import { Injectable, PipeTransform, ArgumentMetadata } from '@nestjs/common';
import { ZodType } from 'zod';
import { ErrorException } from '@errors/types/error-exception';

/**
 * Pipe that validates incoming data against a Zod schema.
 *
 * Throws a VAL0001 ErrorException with per-field details on validation failure.
 *
 * @example
 * ```typescript
 * @Body(new ZodValidationPipe(CreateUserSchema))
 * body: CreateUserDto
 * ```
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw ErrorException.validation(result.error);
    }

    return result.data;
  }
}
