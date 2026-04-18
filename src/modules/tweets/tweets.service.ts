import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Tweet, TweetVisibility } from '@prisma/client';
import { TweetsDbService, TimelineRow } from '@database/tweets/tweets.db-service';
import { DepartmentsDbService } from '@database/departments/departments.db-service';
import { ClsKey } from '@common/cls/cls.constants';
import { DEFAULT_TIMELINE_LIMIT } from '@common/constants';
import { ErrorException } from '@errors/types/error-exception';
import { AUT, VAL } from '@errors/error-codes';
import { InstrumentClass } from '@telemetry/decorators/instrument-class.decorator';
import { CreateTweetDto } from './dto/create-tweet.dto';

/** Public-facing timeline row (camelCase, same fields as raw row). */
export interface TimelineTweet {
  id: string;
  authorId: string;
  content: string;
  visibility: TweetVisibility;
  createdAt: Date;
}

@InstrumentClass()
@Injectable()
export class TweetsService {
  constructor(
    private readonly tweetsDb: TweetsDbService,
    private readonly departmentsDb: DepartmentsDbService,
    private readonly cls: ClsService,
  ) {}

  private require<T>(key: ClsKey): T {
    const v = this.cls.get(key) as T | undefined | null;
    if (v === undefined || v === null) {
      throw new ErrorException(AUT.UNAUTHENTICATED, {
        message: `Missing CLS key: ${key}`,
      });
    }
    return v;
  }

  /**
   * Creates a tweet for the authenticated author.
   *
   * For department-scoped visibility:
   *  1. Pre-validate every referenced department exists in the caller's company
   *     (tenant-scope extension drops cross-tenant rows — length mismatch proves
   *     an attempted cross-tenant reference).
   *  2. Create the tweet and its pivot rows in one transaction.
   *
   * We deliberately do NOT use nested-connect — the tenant-scope extension
   * cannot inspect nested `connect` arguments, so keeping writes flat is the
   * documented mitigation.
   */
  async create(dto: CreateTweetDto): Promise<Tweet> {
    const userId = this.require<string>(ClsKey.USER_ID);
    const companyId = this.require<string>(ClsKey.COMPANY_ID);
    const departmentIds = dto.departmentIds ?? [];

    if (dto.visibility !== 'COMPANY') {
      if (departmentIds.length === 0) {
        throw new ErrorException(VAL.DEPARTMENT_IDS_REQUIRED);
      }
      const existing = await this.departmentsDb.findExistingIdsInCompany(departmentIds, companyId);
      if (existing.length !== new Set(departmentIds).size) {
        throw new ErrorException(VAL.DEPARTMENT_NOT_IN_COMPANY, {
          message: `Referenced department ids include values outside this company.`,
        });
      }
    }

    return this.tweetsDb.createWithTargets({
      companyId,
      authorId: userId,
      content: dto.content,
      visibility: dto.visibility,
      departmentIds: dto.visibility === 'COMPANY' ? [] : departmentIds,
    });
  }

  /**
   * Returns the authenticated user's timeline (newest first), bounded by the
   * default limit. Visibility rules are evaluated entirely in SQL (single
   * recursive CTE); see TweetsDbRepository.findTimelineForUser.
   */
  async timeline(): Promise<TimelineTweet[]> {
    const userId = this.require<string>(ClsKey.USER_ID);
    const companyId = this.require<string>(ClsKey.COMPANY_ID);
    const rows = await this.tweetsDb.findTimelineForUser(userId, companyId, DEFAULT_TIMELINE_LIMIT);
    return rows.map(toTimelineTweet);
  }
}

export function toTimelineTweet(row: TimelineRow): TimelineTweet {
  return {
    id: row.id,
    authorId: row.author_id,
    content: row.content,
    visibility: row.visibility,
    createdAt: row.created_at,
  };
}
