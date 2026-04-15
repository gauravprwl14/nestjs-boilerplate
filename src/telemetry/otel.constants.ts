/**
 * OpenTelemetry constants — single source of truth for all OTel-related
 * string literals. No hardcoded strings anywhere else in the telemetry layer.
 */

// ─── OTLP export paths ────────────────────────────────────────────────────────

/** Default gRPC port for the OTel Collector. */
export const OTEL_COLLECTOR_GRPC_PORT = 4317;

/** Default HTTP/protobuf port for the OTel Collector. */
export const OTEL_COLLECTOR_HTTP_PORT = 4318;

/** Default OTLP gRPC endpoint. */
export const OTEL_DEFAULT_GRPC_ENDPOINT = `http://localhost:${OTEL_COLLECTOR_GRPC_PORT}`;

/** Default OTLP HTTP endpoint. */
export const OTEL_DEFAULT_HTTP_ENDPOINT = `http://localhost:${OTEL_COLLECTOR_HTTP_PORT}`;

// ─── Resource attribute keys ──────────────────────────────────────────────────

/** Semantic Convention: service name attribute key. */
export const RESOURCE_SERVICE_NAME = 'service.name';

/** Semantic Convention: deployment environment attribute key. */
export const RESOURCE_DEPLOYMENT_ENVIRONMENT = 'deployment.environment';

/** Semantic Convention: service version attribute key. */
export const RESOURCE_SERVICE_VERSION = 'service.version';

// ─── Span attribute keys ──────────────────────────────────────────────────────

/** The name of the decorated class method being traced. */
export const SPAN_ATTR_METHOD = 'code.function';

/** The name of the decorated class being traced. */
export const SPAN_ATTR_CLASS = 'code.namespace';

/** HTTP route attribute key. */
export const SPAN_ATTR_HTTP_ROUTE = 'http.route';

/** HTTP status code attribute key. */
export const SPAN_ATTR_HTTP_STATUS_CODE = 'http.response.status_code';

/** Error type attribute key. */
export const SPAN_ATTR_ERROR_TYPE = 'error.type';

// ─── Header names ─────────────────────────────────────────────────────────────

/** W3C Trace Context propagation header. */
export const TRACEPARENT_HEADER = 'traceparent';

/** W3C Trace State propagation header. */
export const TRACESTATE_HEADER = 'tracestate';

// ─── Instrumentation names ────────────────────────────────────────────────────

/** Instrumentation scope name for the application tracer. */
export const TRACER_NAME = 'ai-native-nestjs-backend';

/** Instrumentation scope name for the application meter. */
export const METER_NAME = 'ai-native-nestjs-backend';

// ─── Metric names ─────────────────────────────────────────────────────────────

/** Default histogram metric name for operation duration. */
export const METRIC_DURATION_DEFAULT = 'app.operation.duration';

/** Default counter metric name for generic increments. */
export const METRIC_COUNTER_DEFAULT = 'app.operation.count';

/** HTTP request duration histogram metric. */
export const METRIC_HTTP_REQUEST_DURATION = 'http.server.request.duration';

// ─── Timeout / flush constants ────────────────────────────────────────────────

/** Milliseconds to wait for the SDK to gracefully shut down. */
export const OTEL_SHUTDOWN_TIMEOUT_MS = 5_000;

/** Milliseconds for the export batch timeout. */
export const OTEL_EXPORT_TIMEOUT_MS = 30_000;

// ─── Health check paths to ignore ────────────────────────────────────────────

/** HTTP paths excluded from HTTP auto-instrumentation traces. */
export const OTEL_IGNORE_PATHS: RegExp[] = [/^\/health(\/.*)?$/];
