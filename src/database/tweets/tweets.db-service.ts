import { Injectable } from '@nestjs/common';
import { Tweet, TweetVisibility } from '@prisma/client';
import { TweetsDbRepository, TimelineRow } from './tweets.db-repository';
import { DatabaseService } from '@database/database.service';
import { DbTransactionClient } from '@database/types';

/**
 * Public DB surface for the Tweet aggregate.
 * Exposes create (with optional department targets) and the timeline query.
 */
@Injectable()
export class TweetsDbService {
  constructor(
    private readonly repo: TweetsDbRepository,
    private readonly database: DatabaseService,
  ) {}

  /**
   * Creates a tweet (and optionally its department-target pivot rows) atomically.
   * Empty `departmentIds` is the correct shape for COMPANY visibility.
   */
  async createWithTargets(input: {
    companyId: string;
    authorId: string;
    content: string;
    visibility: TweetVisibility;
    departmentIds: string[];
  }): Promise<Tweet> {
    return this.database.runInTransaction(async (tx) => {
      const tweet = await this.repo.createTweet(
        {
          companyId: input.companyId,
          authorId: input.authorId,
          content: input.content,
          visibility: input.visibility,
        },
        tx,
      );
      if (input.departmentIds.length > 0) {
        await this.repo.createTargets(
          input.departmentIds.map((departmentId) => ({
            tweetId: tweet.id,
            departmentId,
            companyId: input.companyId,
          })),
          tx,
        );
      }
      return tweet;
    });
  }

  /**
   * Returns tweets visible to the user, newest first.
   * @param userId - Viewer's id
   * @param companyId - Viewer's company (used as the tenant-isolation filter in raw SQL)
   * @param limit - Max rows to return
   * @param tx - Optional transaction client
   */
  async findTimelineForUser(
    userId: string,
    companyId: string,
    limit: number,
    tx?: DbTransactionClient,
  ): Promise<TimelineRow[]> {
    return this.repo.findTimelineForUser(userId, companyId, limit, tx);
  }
}

export type { TimelineRow };
