import { HttpStatus } from '@nestjs/common';

/** Error severity levels */
export enum ErrorSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
}

/** High-level error type classification */
export enum ErrorType {
  VALIDATION = 'VALIDATION',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  BUSINESS_LOGIC = 'BUSINESS_LOGIC',
  DATABASE = 'DATABASE',
  INFRASTRUCTURE = 'INFRASTRUCTURE',
  EXTERNAL_SERVICE = 'EXTERNAL_SERVICE',
  TIMEOUT = 'TIMEOUT',
}

/** Error category for metrics and routing */
export enum ErrorCategory {
  CLIENT = 'CLIENT',
  SERVER = 'SERVER',
  DATABASE = 'DATABASE',
  SECURITY = 'SECURITY',
  NETWORK = 'NETWORK',
}

/** Complete error code definition */
export interface ErrorCodeDefinition {
  /** Unique error code (e.g., 'VAL0001') */
  code: string;
  /** Human-readable error message */
  message: string;
  /** HTTP status code */
  httpStatus: HttpStatus;
  /** Error type classification */
  errorType: ErrorType;
  /** Error category for metrics */
  errorCategory: ErrorCategory;
  /** i18n message key for catalogue lookup */
  messageKey: string;
  /** Severity level */
  severity: ErrorSeverity;
  /** Whether the operation can be retried */
  retryable: boolean;
  /** Whether the message is safe to show to end users */
  userFacing: boolean;
}

/** Per-field validation error detail */
export interface ErrorFieldDetail {
  field: string;
  message: string;
  constraint?: string;
}
