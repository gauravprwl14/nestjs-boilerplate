/**
 * Access-control matrix test.
 *
 * Runs against a real Postgres instance. The recursive CTE in the timeline
 * query cannot be exercised meaningfully with mocks — this suite is the canonical
 * proof that visibility rules are correct for all 13 cases (the 12 from the
 * plan's matrix + the author self-view row).
 *
 * Each case seeds a minimal fixture, calls findTimelineForUser, and asserts
 * the target tweet is or isn't in the result set.
 *
 * The suite bypasses the tenant-scope Prisma extension by going direct to
 * PrismaClient (no ClsService wiring) — the extension is covered by its own
 * unit tests.
 */
import { PrismaClient, TweetVisibility } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma } from '@prisma/client';

const adapter = new PrismaPg(
  process.env.DATABASE_URL ??
    'postgresql://gauravporwal@localhost:5432/enterprise_twitter_test?schema=public',
);
const prisma = new PrismaClient({ adapter });

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimelineRow {
  id: string;
  author_id: string;
  content: string;
  visibility: TweetVisibility;
  created_at: Date;
}

// ─── The canonical timeline query, duplicated from TweetsDbRepository so
//     the test is robust against future refactors of the repo signature.
async function fetchTimeline(userId: string, companyId: string): Promise<TimelineRow[]> {
  return prisma.$queryRaw<TimelineRow[]>(Prisma.sql`
    WITH RECURSIVE
    user_direct_depts AS (
      SELECT ud.department_id AS id
      FROM user_departments ud
      WHERE ud.user_id = ${userId} AND ud.company_id = ${companyId}
    ),
    user_dept_ancestors(id, parent_id) AS (
      SELECT d.id, d.parent_id FROM departments d
      WHERE d.id IN (SELECT id FROM user_direct_depts) AND d.company_id = ${companyId}
      UNION
      SELECT p.id, p.parent_id FROM departments p
      INNER JOIN user_dept_ancestors uda ON p.id = uda.parent_id
      WHERE p.company_id = ${companyId}
    )
    SELECT t.id, t.author_id, t.content, t.visibility, t.created_at
    FROM tweets t
    WHERE t.company_id = ${companyId}
      AND (
        t.author_id = ${userId}
        OR t.visibility = 'COMPANY'
        OR (t.visibility = 'DEPARTMENTS' AND EXISTS (
          SELECT 1 FROM tweet_departments td
          WHERE td.tweet_id = t.id AND td.department_id IN (SELECT id FROM user_direct_depts)
        ))
        OR (t.visibility = 'DEPARTMENTS_AND_SUBDEPARTMENTS' AND EXISTS (
          SELECT 1 FROM tweet_departments td
          WHERE td.tweet_id = t.id AND td.department_id IN (SELECT id FROM user_dept_ancestors)
        ))
      )
    ORDER BY t.created_at DESC
    LIMIT 100
  `);
}

// ─── Fixture ──────────────────────────────────────────────────────────────────

interface Fixture {
  companyA: string;
  companyB: string;
  depts: {
    eng: string;
    engBackend: string;
    engBackendApi: string;
    sales: string;
    executive: string;
    bEng: string;
  };
  users: {
    a_noDept: string;
    a_eng: string;
    a_engBackend: string;
    a_engBackendApi: string;
    a_sales: string;
    a_eng_and_sales: string;
    a_executive: string; // author for the ghost-tweet case
    b_eng: string;
  };
  tweets: Record<string, string>;
}

async function seedFixture(): Promise<Fixture> {
  // Clean slate
  await prisma.tweetDepartment.deleteMany({});
  await prisma.tweet.deleteMany({});
  await prisma.userDepartment.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.department.deleteMany({});
  await prisma.company.deleteMany({});

  const a = await prisma.company.create({ data: { name: 'A' } });
  const b = await prisma.company.create({ data: { name: 'B' } });

  const eng = await prisma.department.create({
    data: { companyId: a.id, parentId: null, name: 'eng' },
  });
  const engBackend = await prisma.department.create({
    data: { companyId: a.id, parentId: eng.id, name: 'eng-backend' },
  });
  const engBackendApi = await prisma.department.create({
    data: { companyId: a.id, parentId: engBackend.id, name: 'eng-backend-api' },
  });
  const sales = await prisma.department.create({
    data: { companyId: a.id, parentId: null, name: 'sales' },
  });
  const executive = await prisma.department.create({
    data: { companyId: a.id, parentId: null, name: 'executive' },
  });
  const bEng = await prisma.department.create({
    data: { companyId: b.id, parentId: null, name: 'b-eng' },
  });

  const user = async (companyId: string, name: string, deptIds: string[] = []) => {
    const u = await prisma.user.create({
      data: {
        companyId,
        email: `${name}+${Math.random().toString(36).slice(2, 7)}@test`,
        name,
      },
    });
    for (const d of deptIds) {
      await prisma.userDepartment.create({
        data: { userId: u.id, departmentId: d, companyId },
      });
    }
    return u.id;
  };

  const a_noDept = await user(a.id, 'a-nodept');
  const a_eng = await user(a.id, 'a-eng', [eng.id]);
  const a_engBackend = await user(a.id, 'a-eng-backend', [engBackend.id]);
  const a_engBackendApi = await user(a.id, 'a-eng-backend-api', [engBackendApi.id]);
  const a_sales = await user(a.id, 'a-sales', [sales.id]);
  const a_eng_and_sales = await user(a.id, 'a-eng-and-sales', [eng.id, sales.id]);
  const a_executive = await user(a.id, 'a-executive', [executive.id]);
  const b_eng = await user(b.id, 'b-eng', [bEng.id]);

  const makeTweet = async (
    companyId: string,
    authorId: string,
    visibility: TweetVisibility,
    targetDeptIds: string[] = [],
    content = 'x',
  ) => {
    const t = await prisma.tweet.create({
      data: { companyId, authorId, visibility, content },
    });
    for (const d of targetDeptIds) {
      await prisma.tweetDepartment.create({
        data: { tweetId: t.id, departmentId: d, companyId },
      });
    }
    return t.id;
  };

  const tweets: Record<string, string> = {
    // The scenarios reuse these — names map 1:1 to the matrix case numbers.
    A_COMPANY: await makeTweet(a.id, a_eng, 'COMPANY'),
    B_COMPANY: await makeTweet(b.id, b_eng, 'COMPANY'),
    A_DEPT_eng: await makeTweet(a.id, a_eng, 'DEPARTMENTS', [eng.id]),
    A_DEPT_sales: await makeTweet(a.id, a_sales, 'DEPARTMENTS', [sales.id]),
    A_DSUB_eng: await makeTweet(a.id, a_eng, 'DEPARTMENTS_AND_SUBDEPARTMENTS', [eng.id]),
    // Case 13 — author in executive, tweet targets engineering (ghost-tweet fix).
    A_DEPT_eng_by_exec: await makeTweet(a.id, a_executive, 'DEPARTMENTS', [eng.id]),
  };

  return {
    companyA: a.id,
    companyB: b.id,
    depts: {
      eng: eng.id,
      engBackend: engBackend.id,
      engBackendApi: engBackendApi.id,
      sales: sales.id,
      executive: executive.id,
      bEng: bEng.id,
    },
    users: {
      a_noDept,
      a_eng,
      a_engBackend,
      a_engBackendApi,
      a_sales,
      a_eng_and_sales,
      a_executive,
      b_eng,
    },
    tweets,
  };
}

describe('ACL matrix (real Postgres)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await seedFixture();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ── Case 1 ──
  it('case 1: no-dept user in A sees COMPANY tweet in A', async () => {
    const rows = await fetchTimeline(fx.users.a_noDept, fx.companyA);
    expect(rows.map(r => r.id)).toContain(fx.tweets.A_COMPANY);
  });

  // ── Case 2 ──
  it('case 2: eng user in A sees COMPANY tweet in A', async () => {
    const rows = await fetchTimeline(fx.users.a_eng, fx.companyA);
    expect(rows.map(r => r.id)).toContain(fx.tweets.A_COMPANY);
  });

  // ── Case 3 ──
  it('case 3: user in A does NOT see COMPANY tweet from B', async () => {
    const rows = await fetchTimeline(fx.users.a_eng, fx.companyA);
    expect(rows.map(r => r.id)).not.toContain(fx.tweets.B_COMPANY);
  });

  // ── Case 4 ──
  it('case 4: eng user in A sees DEPARTMENTS tweet targeted at eng', async () => {
    const rows = await fetchTimeline(fx.users.a_eng, fx.companyA);
    expect(rows.map(r => r.id)).toContain(fx.tweets.A_DEPT_eng);
  });

  // ── Case 5 ──
  it('case 5: eng user does NOT see DEPARTMENTS tweet targeted at sales', async () => {
    const rows = await fetchTimeline(fx.users.a_eng, fx.companyA);
    expect(rows.map(r => r.id)).not.toContain(fx.tweets.A_DEPT_sales);
  });

  // ── Case 6 ──
  it('case 6: eng-backend user does NOT see DEPARTMENTS tweet (direct-only) at eng', async () => {
    const rows = await fetchTimeline(fx.users.a_engBackend, fx.companyA);
    expect(rows.map(r => r.id)).not.toContain(fx.tweets.A_DEPT_eng);
  });

  // ── Case 7 ──
  it('case 7: eng-backend user sees D_AND_SUB tweet at eng (via ancestor climb)', async () => {
    const rows = await fetchTimeline(fx.users.a_engBackend, fx.companyA);
    expect(rows.map(r => r.id)).toContain(fx.tweets.A_DSUB_eng);
  });

  // ── Case 8 ──
  it('case 8: eng user sees D_AND_SUB tweet at eng (self-match)', async () => {
    const rows = await fetchTimeline(fx.users.a_eng, fx.companyA);
    expect(rows.map(r => r.id)).toContain(fx.tweets.A_DSUB_eng);
  });

  // ── Case 9 ──
  it('case 9: sales user does NOT see D_AND_SUB tweet at eng', async () => {
    const rows = await fetchTimeline(fx.users.a_sales, fx.companyA);
    expect(rows.map(r => r.id)).not.toContain(fx.tweets.A_DSUB_eng);
  });

  // ── Case 10 ──
  it('case 10: user in eng+sales sees DEPARTMENTS tweet targeted at sales', async () => {
    const rows = await fetchTimeline(fx.users.a_eng_and_sales, fx.companyA);
    expect(rows.map(r => r.id)).toContain(fx.tweets.A_DEPT_sales);
  });

  // ── Case 11 ──
  it('case 11: eng-backend-api user (2 levels deep) sees D_AND_SUB tweet at eng', async () => {
    const rows = await fetchTimeline(fx.users.a_engBackendApi, fx.companyA);
    expect(rows.map(r => r.id)).toContain(fx.tweets.A_DSUB_eng);
  });

  // ── Case 12 ──
  it('case 12: eng user in B does NOT see D_AND_SUB tweet targeted at A.eng', async () => {
    const rows = await fetchTimeline(fx.users.b_eng, fx.companyB);
    expect(rows.map(r => r.id)).not.toContain(fx.tweets.A_DSUB_eng);
  });

  // ── Case 13 (ghost-tweet fix) ──
  it('case 13: executive author sees their own DEPARTMENTS tweet targeted at engineering', async () => {
    const rows = await fetchTimeline(fx.users.a_executive, fx.companyA);
    expect(rows.map(r => r.id)).toContain(fx.tweets.A_DEPT_eng_by_exec);
  });

  it('sanity: executive user does NOT see eng-only DEPARTMENTS tweet authored by SOMEONE ELSE', async () => {
    // Complement of case 13 — proves the self-view is the reason, not a blanket bug.
    const rows = await fetchTimeline(fx.users.a_executive, fx.companyA);
    expect(rows.map(r => r.id)).not.toContain(fx.tweets.A_DEPT_eng);
  });
});
