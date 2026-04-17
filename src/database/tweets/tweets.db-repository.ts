import { Injectable } from '@nestjs/common';
import { Prisma, Tweet, TweetVisibility } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { BaseRepository } from '@database/base.repository';
import { DbTransactionClient } from '@database/types';

/** Row shape returned by findTimelineForUser — snake_case from raw SQL. */
export interface TimelineRow {
  id: string;
  author_id: string;
  content: string;
  visibility: TweetVisibility;
  created_at: Date;
}

/**
 * Repository for the Tweet + TweetDepartment models. Only file outside
 * src/database that touches those Prisma delegates. Delegate access goes
 * through the tenant-scope extension (`prisma.tenantScoped`); raw SQL does not,
 * so the timeline query hard-codes `companyId` in every predicate.
 */
@Injectable()
export class TweetsDbRepository extends BaseRepository<
  Tweet,
  Prisma.TweetCreateInput,
  Prisma.TweetUpdateInput,
  Prisma.TweetWhereUniqueInput,
  Prisma.TweetWhereInput,
  Prisma.TweetOrderByWithRelationInput
> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  protected delegateFor(client: PrismaService | DbTransactionClient) {
    if (client === this.prisma) {
      return (this.prisma.tenantScoped as unknown as { tweet: Prisma.TweetDelegate }).tweet;
    }
    return (client as DbTransactionClient).tweet;
  }

  private tweetDepartmentDelegate(client: PrismaService | DbTransactionClient) {
    if (client === this.prisma) {
      return (this.prisma.tenantScoped as unknown as {
        tweetDepartment: Prisma.TweetDepartmentDelegate;
      }).tweetDepartment;
    }
    return (client as DbTransactionClient).tweetDepartment;
  }

  /**
   * Creates a tweet with a flat payload (no nested connect). The tenant-scope
   * extension asserts `companyId` matches the CLS value.
   */
  async createTweet(
    input: {
      companyId: string;
      authorId: string;
      content: string;
      visibility: TweetVisibility;
    },
    tx?: DbTransactionClient,
  ): Promise<Tweet> {
    const delegate = this.delegateFor(this.client(tx));
    return delegate.create({ data: input } as unknown as { data: Prisma.TweetCreateInput });
  }

  /**
   * Writes the department-target pivot rows. Flat `createMany` with explicit
   * companyId on every row.
   */
  async createTargets(
    rows: Array<{ tweetId: string; departmentId: string; companyId: string }>,
    tx?: DbTransactionClient,
  ): Promise<void> {
    if (rows.length === 0) return;
    const delegate = this.tweetDepartmentDelegate(this.client(tx));
    await (delegate as unknown as {
      createMany: (args: {
        data: Array<{ tweetId: string; departmentId: string; companyId: string }>;
        skipDuplicates?: boolean;
      }) => Promise<{ count: number }>;
    }).createMany({ data: rows, skipDuplicates: true });
  }

  /**
   * Returns the tweets visible to `userId` (newest first), honoring all three
   * visibility rules AND author self-visibility.
   *
   * Implementation — single recursive-CTE query:
   *
   *   1. `user_direct_depts`    = the user's direct department memberships
   *   2. `user_dept_ancestors`  = climb parents from every direct dept — the full
   *      set of departments the user inherits visibility from
   *   3. WHERE visibility branch:
   *      - author_id = userId             (self-view: authors always see own tweets)
   *      - OR COMPANY                     (tenant-wide)
   *      - OR DEPARTMENTS ∩ direct        (target dept ∈ user's direct depts)
   *      - OR D_AND_SUB ∩ ancestors       (target dept is an ancestor — inherits down)
   *
   * `$queryRaw` bypasses the Prisma tenant-scope extension, so `companyId` is
   * hard-coded into every predicate to preserve tenant isolation (known ORM
   * blindspot — called out in the README).
   *
   * `UNION` (not `UNION ALL`) in the recursive CTE is deliberate: when multiple
   * direct departments share ancestors, per-iteration dedup keeps recursion
   * bounded by the number of nodes in the subtree instead of exploding.
   */
  async findTimelineForUser(
    userId: string,
    companyId: string,
    limit: number,
    tx?: DbTransactionClient,
  ): Promise<TimelineRow[]> {
    const client = this.client(tx);
    return (client as unknown as {
      $queryRaw: <T>(sql: Prisma.Sql) => Promise<T>;
    }).$queryRaw<TimelineRow[]>(Prisma.sql`
      WITH RECURSIVE
      user_direct_depts AS (
        SELECT ud.department_id AS id
        FROM user_departments ud
        WHERE ud.user_id = ${userId} AND ud.company_id = ${companyId}
      ),
      user_dept_ancestors(id, parent_id) AS (
        SELECT d.id, d.parent_id
        FROM departments d
        WHERE d.id IN (SELECT id FROM user_direct_depts)
          AND d.company_id = ${companyId}
        UNION
        SELECT p.id, p.parent_id
        FROM departments p
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
            WHERE td.tweet_id = t.id
              AND td.department_id IN (SELECT id FROM user_direct_depts)
          ))
          OR (t.visibility = 'DEPARTMENTS_AND_SUBDEPARTMENTS' AND EXISTS (
            SELECT 1 FROM tweet_departments td
            WHERE td.tweet_id = t.id
              AND td.department_id IN (SELECT id FROM user_dept_ancestors)
          ))
        )
      ORDER BY t.created_at DESC
      LIMIT ${limit}
    `);
  }
}
