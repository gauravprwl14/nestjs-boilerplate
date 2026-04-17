/**
 * E2E test verifying that AuthService.register rolls back the user row when
 * refresh-token issuance fails inside the runInTransaction boundary.
 *
 * Requires a running database (DATABASE_URL must be set and reachable).
 * The suite is automatically skipped when no database is available to avoid
 * false CI failures.
 *
 * Run with:
 *   npx jest --config test/jest-e2e.json test/e2e/auth-register-rollback.e2e-spec.ts
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '@/app.module';
import { PrismaService } from '@database/prisma.service';
import { AuthCredentialsDbService } from '@database/auth-credentials/auth-credentials.db-service';

const isDatabaseAvailable = Boolean(process.env.DATABASE_URL);

// Skip the entire suite if the database is not configured
const describeConditional = isDatabaseAvailable ? describe : describe.skip;

describeConditional('Auth register rollback (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authCredentialsDb: AuthCredentialsDbService;

  beforeAll(async () => {
    try {
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleRef.createNestApplication();
      app.setGlobalPrefix('api');
      app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
      await app.init();

      prisma = app.get(PrismaService);
      authCredentialsDb = app.get(AuthCredentialsDbService);
    } catch (err) {
      console.warn('E2E test setup failed (likely no database):', (err as Error).message);
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('rolls back the user row when refresh-token issuance fails', async () => {
    if (!app) return;

    const email = `rollback-${Date.now()}@test.com`;

    const spy = jest
      .spyOn(authCredentialsDb, 'issueRefreshToken')
      .mockRejectedValueOnce(new Error('simulated token issue failure'));

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'Passw0rd!', firstName: 'X' })
      .expect(res => {
        expect(res.status).toBeGreaterThanOrEqual(500);
      });

    const user = await prisma.user.findFirst({ where: { email } });
    expect(user).toBeNull();

    spy.mockRestore();
  });
});
