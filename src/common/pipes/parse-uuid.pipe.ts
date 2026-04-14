import { Injectable, PipeTransform, ArgumentMetadata } from '@nestjs/common';
import { ErrorFactory } from '@errors/types/error-factory';

/** UUID v4 regex pattern */
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Pipe that validates a string parameter is a valid UUID v4.
 *
 * Throws a VAL0001 AppError if the value is not a valid UUID v4.
 *
 * @example
 * ```typescript
 * @Param('id', ParseUuidPipe)
 * id: string
 * ```
 */
@Injectable()
export class ParseUuidPipe implements PipeTransform<string, string> {
  transform(value: string, metadata: ArgumentMetadata): string {
    if (!UUID_V4_REGEX.test(value)) {
      const field = metadata.data ?? 'id';
      throw ErrorFactory.validation(`Invalid UUID v4 for parameter '${field}'`, [
        { field, message: 'Must be a valid UUID v4' },
      ]);
    }

    return value;
  }
}
