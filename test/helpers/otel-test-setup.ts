/**
 * Jest `setupFiles` entry for the observability e2e suite.
 *
 * Runs **before** the test file (and supertest / nestjs) is evaluated, so the
 * in-memory {@link NodeSDK} from {@link installInMemoryOtel} has a chance to
 * patch Node core (`http`) and the Prisma client via the require-in-the-middle
 * hooks. Without this, supertest/http would already be cached by the time
 * `beforeAll` runs and the HTTP instrumentation would silently no-op — no
 * SERVER-kind span would be emitted for an incoming request.
 *
 * The exporter + shutdown handle are stashed on `globalThis.__OTEL_TEST__`
 * so test files can reach them without re-initialising the SDK.
 *
 * Keyed by the global flag `__OTEL_TEST_DISABLE__` so other e2e specs in the
 * same `test:e2e` run (e.g. `tweets.e2e-spec.ts`) that don't want OTel can
 * short-circuit — today every file opts in, so the flag is future-proofing.
 */
import { installInMemoryOtel, type InMemoryOtelHandle } from './otel-test';

declare global {
  var __OTEL_TEST__: InMemoryOtelHandle | undefined;

  var __OTEL_TEST_DISABLE__: boolean | undefined;
}

if (!globalThis.__OTEL_TEST_DISABLE__ && !globalThis.__OTEL_TEST__) {
  // IMPORTANT: installInMemoryOtel() starts the NodeSDK which registers a
  // require-in-the-middle hook against Node's `http` module. This call must
  // therefore happen BEFORE any other module in the test imports `http`
  // (supertest, @nestjs/platform-express, etc.). jest-e2e.json wires this
  // file into `setupFiles`, which Jest evaluates before the test module.
  globalThis.__OTEL_TEST__ = installInMemoryOtel();
}
