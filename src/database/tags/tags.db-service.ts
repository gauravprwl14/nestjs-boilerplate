import { Injectable } from '@nestjs/common';
import { Tag } from '@prisma/client';
import { TagsDbRepository } from '@database/tags/tags.db-repository';
import { DbTransactionClient } from '@database/types';

/**
 * DB-layer service for the Tag aggregate. Only file outside src/database
 * that can reach Tag.
 */
@Injectable()
export class TagsDbService {
  constructor(private readonly repo: TagsDbRepository) {}

  /**
   * Finds a tag by name.
   * @param name - Tag name to look up
   * @param tx - Optional transaction client
   */
  findByName(name: string, tx?: DbTransactionClient): Promise<Tag | null> {
    return this.repo.findByName(name, tx);
  }

  /**
   * Finds a tag by id.
   * @param id - Tag UUID
   * @param tx - Optional transaction client
   */
  findById(id: string, tx?: DbTransactionClient): Promise<Tag | null> {
    return this.repo.findById(id, tx);
  }

  /**
   * Returns every tag.
   * @param tx - Optional transaction client
   */
  findAll(tx?: DbTransactionClient): Promise<Tag[]> {
    return this.repo.findAll(tx);
  }

  /**
   * Creates a tag.
   * @param input - Tag name and optional color
   * @param tx - Optional transaction client
   */
  create(input: { name: string; color?: string | null }, tx?: DbTransactionClient): Promise<Tag> {
    return this.repo.createTag(input, tx);
  }
}
