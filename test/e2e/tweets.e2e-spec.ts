/**
 * End-to-end happy-path for tweets + timeline.
 *
 * Spins up the full Nest app (including the MockAuthMiddleware, AuthContextGuard,
 * Prisma tenant-scope extension) and walks a single scenario against a real
 * Postgres database:
 *
 *   1. Create a user + company directly via Prisma (the assignment doesn't
 *      require a signup endpoint; seed-like preflight).
 *   2. POST /tweets as that user → 201, tweet row returned.
 *   3. GET /timeline as the same user → includes the tweet just posted.
 *
 * Cross-tenant isolation is exercised in the ACL matrix suite; this file
 * keeps e2e surface minimal and focused on the HTTP happy path.
 */
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from '../../src/app.module';
import { AppLogger } from '../../src/logger/logger.service';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../../src/common/interceptors/transform.interceptor';

describe('Tweets e2e (happy path)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  let userId: string;
  let companyId: string;

  beforeAll(async () => {
    const url =
      process.env.DATABASE_URL ??
      'postgresql://gauravporwal@localhost:5432/enterprise_twitter_test?schema=public';
    prisma = new PrismaClient({ adapter: new PrismaPg(url) });

    // Clean slate — the ACL matrix suite also truncates. Order matters for FKs.
    await prisma.tweetDepartment.deleteMany({});
    await prisma.tweet.deleteMany({});
    await prisma.userDepartment.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.department.deleteMany({});
    await prisma.company.deleteMany({});

    const company = await prisma.company.create({ data: { name: 'E2E-Co' } });
    companyId = company.id;
    const user = await prisma.user.create({
      data: { companyId, email: 'e2e@test', name: 'E2E User' },
    });
    userId = user.id;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    const logger = app.get(AppLogger);
    app.useLogger(logger);

    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    app.useGlobalFilters(app.get(AllExceptionsFilter));
    app.useGlobalInterceptors(new TransformInterceptor());

    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('POST /api/v1/tweets then GET /api/v1/timeline round-trips', async () => {
    // Arrange — header carrying the seeded userId.
    const auth = { 'x-user-id': userId };

    // Act — create a tweet
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/tweets')
      .set(auth)
      .send({ content: 'hello world', visibility: 'COMPANY' })
      .expect(201);

    // Assert — create response shape
    const created = createRes.body.data;
    expect(created).toMatchObject({
      content: 'hello world',
      visibility: 'COMPANY',
      companyId,
      authorId: userId,
    });

    // Act — fetch timeline
    const listRes = await request(app.getHttpServer())
      .get('/api/v1/timeline')
      .set(auth)
      .expect(200);

    // Assert — the new tweet is present
    const ids = (listRes.body.data as Array<{ id: string }>).map(t => t.id);
    expect(ids).toContain(created.id);
  });

  it('GET /api/v1/timeline rejects requests without x-user-id', async () => {
    // Act + Assert — no header set
    const res = await request(app.getHttpServer()).get('/api/v1/timeline').expect(401);
    expect(res.body.errors[0].code).toBe('AUT0001');
  });
});
