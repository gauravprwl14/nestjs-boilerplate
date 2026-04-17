/* eslint-disable no-console */
import { PrismaClient, TweetVisibility } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

/**
 * Seed: three companies with varying tree shapes + a matrix of tweets that
 * exercises every visibility rule. Prints a user-id table AND a "try this"
 * scenario table at the end so reviewers can spot-check without reading code.
 */
async function main() {
  console.log('\nSeeding Enterprise Twitter…\n');

  // ── Wipe (idempotent re-seed) ────────────────────────────────────────────
  await prisma.tweetDepartment.deleteMany({});
  await prisma.tweet.deleteMany({});
  await prisma.userDepartment.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.department.deleteMany({});
  await prisma.company.deleteMany({});

  // ── Companies ────────────────────────────────────────────────────────────
  const acme = await prisma.company.create({ data: { name: 'Acme Corp' } });
  const globex = await prisma.company.create({ data: { name: 'Globex Industries' } });
  const initech = await prisma.company.create({ data: { name: 'Initech' } });

  // ── Acme dept tree (4-level eng branch + siblings) ───────────────────────
  //
  //   Acme
  //   ├── Executive
  //   │     └── ExecOps
  //   ├── Engineering
  //   │     ├── EngBackend
  //   │     │     └── EngBackendApi
  //   │     │           └── EngBackendApiAuth      ← 4 levels below Engineering
  //   │     └── EngFrontend
  //   └── Sales
  //         ├── SalesWest
  //         └── SalesEast
  const acmeExec = await prisma.department.create({
    data: { companyId: acme.id, parentId: null, name: 'Executive' },
  });
  const acmeExecOps = await prisma.department.create({
    data: { companyId: acme.id, parentId: acmeExec.id, name: 'Exec · Ops' },
  });
  const acmeEng = await prisma.department.create({
    data: { companyId: acme.id, parentId: null, name: 'Engineering' },
  });
  const acmeEngBackend = await prisma.department.create({
    data: { companyId: acme.id, parentId: acmeEng.id, name: 'Eng · Backend' },
  });
  const acmeEngBackendApi = await prisma.department.create({
    data: { companyId: acme.id, parentId: acmeEngBackend.id, name: 'Eng · Backend · API' },
  });
  const acmeEngBackendApiAuth = await prisma.department.create({
    data: {
      companyId: acme.id,
      parentId: acmeEngBackendApi.id,
      name: 'Eng · Backend · API · Auth',
    },
  });
  const acmeEngFrontend = await prisma.department.create({
    data: { companyId: acme.id, parentId: acmeEng.id, name: 'Eng · Frontend' },
  });
  const acmeSales = await prisma.department.create({
    data: { companyId: acme.id, parentId: null, name: 'Sales' },
  });
  const acmeSalesWest = await prisma.department.create({
    data: { companyId: acme.id, parentId: acmeSales.id, name: 'Sales · West' },
  });
  const acmeSalesEast = await prisma.department.create({
    data: { companyId: acme.id, parentId: acmeSales.id, name: 'Sales · East' },
  });

  // ── Globex dept tree (3-level) ───────────────────────────────────────────
  const globexEng = await prisma.department.create({
    data: { companyId: globex.id, parentId: null, name: 'Engineering' },
  });
  const globexEngDevops = await prisma.department.create({
    data: { companyId: globex.id, parentId: globexEng.id, name: 'Eng · DevOps' },
  });
  const globexEngDevopsSre = await prisma.department.create({
    data: { companyId: globex.id, parentId: globexEngDevops.id, name: 'Eng · DevOps · SRE' },
  });
  const globexOps = await prisma.department.create({
    data: { companyId: globex.id, parentId: null, name: 'Operations' },
  });

  // ── Initech (flat) ───────────────────────────────────────────────────────
  const initechEng = await prisma.department.create({
    data: { companyId: initech.id, parentId: null, name: 'Engineering' },
  });
  const initechBiz = await prisma.department.create({
    data: { companyId: initech.id, parentId: null, name: 'Business' },
  });

  // ── Helpers ──────────────────────────────────────────────────────────────
  const makeUser = async (companyId: string, name: string, email: string, deptIds: string[]) => {
    const u = await prisma.user.create({ data: { companyId, email, name } });
    for (const d of deptIds) {
      await prisma.userDepartment.create({
        data: { userId: u.id, departmentId: d, companyId },
      });
    }
    return u;
  };
  const makeTweet = async (
    companyId: string,
    authorId: string,
    visibility: TweetVisibility,
    content: string,
    targetDeptIds: string[] = [],
  ) => {
    const t = await prisma.tweet.create({
      data: { companyId, authorId, visibility, content },
    });
    for (const d of targetDeptIds) {
      await prisma.tweetDepartment.create({
        data: { tweetId: t.id, departmentId: d, companyId },
      });
    }
    return t;
  };

  // ── Acme users ───────────────────────────────────────────────────────────
  const alice = await makeUser(acme.id, 'Alice (CEO)', 'alice@acme.test', [acmeExec.id]);
  const bob = await makeUser(acme.id, 'Bob (Eng Director)', 'bob@acme.test', [acmeEng.id]);
  const carol = await makeUser(acme.id, 'Carol (Backend Lead)', 'carol@acme.test', [
    acmeEngBackend.id,
  ]);
  const dave = await makeUser(acme.id, 'Dave (API Engineer)', 'dave@acme.test', [
    acmeEngBackendApi.id,
  ]);
  const eva = await makeUser(
    acme.id,
    'Eva (Auth Engineer — deep 4-level)',
    'eva@acme.test',
    [acmeEngBackendApiAuth.id],
  );
  const fiona = await makeUser(acme.id, 'Fiona (Frontend)', 'fiona@acme.test', [
    acmeEngFrontend.id,
  ]);
  const greta = await makeUser(acme.id, 'Greta (Sales — West)', 'greta@acme.test', [
    acmeSalesWest.id,
  ]);
  const harold = await makeUser(acme.id, 'Harold (Sales — East)', 'harold@acme.test', [
    acmeSalesEast.id,
  ]);
  const ivan = await makeUser(
    acme.id,
    'Ivan (Multi-dept — Sales + Exec)',
    'ivan@acme.test',
    [acmeSales.id, acmeExec.id],
  );
  const nora = await makeUser(acme.id, 'Nora (No dept — lone user)', 'nora@acme.test', []);

  // ── Globex users ─────────────────────────────────────────────────────────
  const paul = await makeUser(globex.id, 'Paul (Globex Eng Director)', 'paul@globex.test', [
    globexEng.id,
  ]);
  const quinn = await makeUser(globex.id, 'Quinn (Globex DevOps)', 'quinn@globex.test', [
    globexEngDevops.id,
  ]);
  const rhea = await makeUser(globex.id, 'Rhea (Globex SRE — 2-level)', 'rhea@globex.test', [
    globexEngDevopsSre.id,
  ]);
  const sam = await makeUser(globex.id, 'Sam (Globex Ops)', 'sam@globex.test', [globexOps.id]);

  // ── Initech users ────────────────────────────────────────────────────────
  const tina = await makeUser(initech.id, 'Tina (Initech Eng)', 'tina@initech.test', [
    initechEng.id,
  ]);
  const umar = await makeUser(initech.id, 'Umar (Initech Biz)', 'umar@initech.test', [
    initechBiz.id,
  ]);

  // ── Tweets (spread across companies + every visibility rule) ─────────────
  // Acme: COMPANY-wide welcome
  await makeTweet(acme.id, alice.id, 'COMPANY', 'Welcome to Acme, everyone! Q4 kickoff Monday.');
  // Acme: GHOST-TWEET demo — author in Executive, target Engineering
  await makeTweet(
    acme.id,
    alice.id,
    'DEPARTMENTS',
    'Engineering — budget sign-off attached (CEO direct).',
    [acmeEng.id],
  );
  // Acme: DEPARTMENTS_AND_SUBDEPARTMENTS across whole eng subtree (Bob → eng)
  await makeTweet(
    acme.id,
    bob.id,
    'DEPARTMENTS_AND_SUBDEPARTMENTS',
    'Eng all-hands: refactoring sprint starts Wednesday.',
    [acmeEng.id],
  );
  // Acme: DEPARTMENTS_AND_SUBDEPARTMENTS scoped to backend subtree only
  await makeTweet(
    acme.id,
    carol.id,
    'DEPARTMENTS_AND_SUBDEPARTMENTS',
    'Backend-only: API v2 migration cutover this Friday.',
    [acmeEngBackend.id],
  );
  // Acme: DEPARTMENTS to frontend-only (Bob → frontend)
  await makeTweet(acme.id, bob.id, 'DEPARTMENTS', 'Frontend: design review tomorrow 10am.', [
    acmeEngFrontend.id,
  ]);
  // Acme: DEPARTMENTS with MULTIPLE targets — both sales sub-depts
  await makeTweet(
    acme.id,
    ivan.id,
    'DEPARTMENTS',
    'Sales west + east: new commission structure posted.',
    [acmeSalesWest.id, acmeSalesEast.id],
  );
  // Acme: DEPARTMENTS targeting the DEEPEST node (auth)
  await makeTweet(
    acme.id,
    bob.id,
    'DEPARTMENTS',
    'Auth team only: please rotate prod secrets today.',
    [acmeEngBackendApiAuth.id],
  );

  // Globex: COMPANY-wide
  await makeTweet(globex.id, paul.id, 'COMPANY', 'Globex team, incident retro at 3pm today.');
  // Globex: D_AND_SUB across whole eng subtree
  await makeTweet(
    globex.id,
    paul.id,
    'DEPARTMENTS_AND_SUBDEPARTMENTS',
    'Engineers (incl. SRE): please update your on-call schedules.',
    [globexEng.id],
  );
  // Globex: DEPARTMENTS to a middle node (devops) — direct-members-only
  await makeTweet(
    globex.id,
    quinn.id,
    'DEPARTMENTS',
    'DevOps direct: new Kube operator playbook.',
    [globexEngDevops.id],
  );

  // Initech: COMPANY-wide
  await makeTweet(
    initech.id,
    tina.id,
    'COMPANY',
    'Initech all-hands: stapler policy clarification.',
  );
  // Initech: DEPARTMENTS to Biz — should NOT be visible to Tina in Eng
  await makeTweet(
    initech.id,
    umar.id,
    'DEPARTMENTS',
    'Biz team: Q4 pipeline review Thursday.',
    [initechBiz.id],
  );

  // ── Print user table ─────────────────────────────────────────────────────
  const line = '─'.repeat(118);
  console.log(line);
  console.log(
    'Seed complete. Use any id below as the x-user-id header:  curl -H "x-user-id: <id>" http://localhost:3000/api/v1/timeline',
  );
  console.log(line);
  const userRows = [
    { u: alice, company: 'Acme', dept: 'Executive' },
    { u: bob, company: 'Acme', dept: 'Engineering' },
    { u: carol, company: 'Acme', dept: 'Eng · Backend' },
    { u: dave, company: 'Acme', dept: 'Eng · Backend · API' },
    { u: eva, company: 'Acme', dept: 'Eng · Backend · API · Auth (4-level deep)' },
    { u: fiona, company: 'Acme', dept: 'Eng · Frontend' },
    { u: greta, company: 'Acme', dept: 'Sales · West' },
    { u: harold, company: 'Acme', dept: 'Sales · East' },
    { u: ivan, company: 'Acme', dept: 'Sales + Executive (multi-dept)' },
    { u: nora, company: 'Acme', dept: '(no dept)' },
    { u: paul, company: 'Globex', dept: 'Engineering' },
    { u: quinn, company: 'Globex', dept: 'Eng · DevOps' },
    { u: rhea, company: 'Globex', dept: 'Eng · DevOps · SRE (2-level deep)' },
    { u: sam, company: 'Globex', dept: 'Operations' },
    { u: tina, company: 'Initech', dept: 'Engineering' },
    { u: umar, company: 'Initech', dept: 'Business' },
  ];
  for (const { u, company, dept } of userRows) {
    console.log(
      `  ${u.name.padEnd(42)} | ${company.padEnd(8)} | ${dept.padEnd(42)} | ${u.id}`,
    );
  }

  // ── Print dept id table (handy for POST /tweets with departmentIds) ─────
  console.log(line);
  console.log('Department ids (for POST /tweets `departmentIds`):');
  console.log(line);
  const deptRows = [
    { c: 'Acme', n: 'Executive', id: acmeExec.id },
    { c: 'Acme', n: 'Exec · Ops', id: acmeExecOps.id },
    { c: 'Acme', n: 'Engineering', id: acmeEng.id },
    { c: 'Acme', n: 'Eng · Backend', id: acmeEngBackend.id },
    { c: 'Acme', n: 'Eng · Backend · API', id: acmeEngBackendApi.id },
    { c: 'Acme', n: 'Eng · Backend · API · Auth', id: acmeEngBackendApiAuth.id },
    { c: 'Acme', n: 'Eng · Frontend', id: acmeEngFrontend.id },
    { c: 'Acme', n: 'Sales', id: acmeSales.id },
    { c: 'Acme', n: 'Sales · West', id: acmeSalesWest.id },
    { c: 'Acme', n: 'Sales · East', id: acmeSalesEast.id },
    { c: 'Globex', n: 'Engineering', id: globexEng.id },
    { c: 'Globex', n: 'Eng · DevOps', id: globexEngDevops.id },
    { c: 'Globex', n: 'Eng · DevOps · SRE', id: globexEngDevopsSre.id },
    { c: 'Globex', n: 'Operations', id: globexOps.id },
    { c: 'Initech', n: 'Engineering', id: initechEng.id },
    { c: 'Initech', n: 'Business', id: initechBiz.id },
  ];
  for (const r of deptRows) {
    console.log(`  ${r.c.padEnd(8)} | ${r.n.padEnd(30)} | ${r.id}`);
  }

  // ── Scenario guide ──────────────────────────────────────────────────────
  console.log(line);
  console.log('Try these timeline scenarios (GET /api/v1/timeline with x-user-id = …):');
  console.log(line);
  console.log(`
  • Alice (Acme CEO) —
      sees: Acme COMPANY welcome + her own "Engineering budget" tweet (author self-view —
            would be hidden otherwise because she's in Executive, not Engineering).
      does NOT see: any Globex or Initech tweets.

  • Bob (Acme Engineering) —
      sees: COMPANY welcome, his own "eng sprint" + "frontend" + "auth rotate" tweets,
            Carol's "backend-only" tweet (inherited DOWN from eng ancestor), Alice's
            "budget" tweet (target = eng, direct member).

  • Eva (Acme Eng · Backend · API · Auth — 4-level deep) —
      sees: COMPANY welcome, Bob's "eng sprint" (D_AND_SUB on eng → expands to auth),
            Carol's "backend-only" (D_AND_SUB on backend → expands to auth), Bob's
            "auth rotate" (direct target).
      does NOT see: frontend tweet, sales tweets, Alice's "budget" DEPARTMENTS tweet
                    (direct-only, she's not directly in eng).

  • Fiona (Acme Eng · Frontend) —
      sees: COMPANY welcome, Bob's "frontend review" (direct), Bob's "eng sprint"
            (D_AND_SUB includes frontend subtree).
      does NOT see: "backend-only" tweet, "auth rotate" tweet.

  • Greta/Harold (Acme Sales · West or East) —
      sees: COMPANY welcome, "sales commission" tweet (multi-target).

  • Ivan (Acme Sales + Executive multi-dept) —
      sees: COMPANY welcome, "sales commission" (via his sales membership),
            AND his own "commission" tweet is echoed back via author self-view.

  • Nora (Acme — no dept) —
      sees: COMPANY welcome ONLY. No dept-scoped tweets reach her.

  • Rhea (Globex Eng · DevOps · SRE — 2-level deep) —
      sees: Globex COMPANY retro, Paul's D_AND_SUB eng tweet (ancestor climb: SRE → DevOps → Eng).
      does NOT see: Quinn's "devops-direct" tweet (direct-only, and she's below devops).

  • Tina (Initech Eng) —
      sees: Initech COMPANY stapler tweet ONLY.
      does NOT see: Umar's "biz pipeline" DEPARTMENTS tweet (wrong dept).

  • Paul with x-user-id set to Alice's id —
      proves tenant isolation: no Acme user can masquerade by picking another tenant's
      user — but a user CAN see only their own tenant's tweets. (Trying Alice's id from
      a Globex context is nonsensical: the id simply resolves to Acme and you get Acme
      content. Cross-tenant attacks happen when a Globex user REFERENCES an Acme dept
      id in POST /tweets — that case returns VAL0008.)
`);
  console.log(line);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
