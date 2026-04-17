import { Injectable } from '@nestjs/common';
import { Prisma, Tag } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { BaseRepository } from '@database/base.repository';
import { DbTransactionClient } from '@database/types';

/**
 * Repository for the Tag model. Only file outside src/database that touches
 * Prisma's tag delegate.
 */
@Injectable()
export class TagsDbRepository extends BaseRepository<
  Tag,
  Prisma.TagCreateInput,
  Prisma.TagUpdateInput,
  Prisma.TagWhereUniqueInput,
  Prisma.TagWhereInput,
  Prisma.TagOrderByWithRelationInput
> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  protected delegateFor(client: PrismaService | DbTransactionClient) {
    return client.tag;
  }

  /**
   * Finds a tag by its name (case-sensitive — the `name` column has a unique index).
   * @param name - Tag name
   * @param tx - Optional transaction client
   */
  async findByName(name: string, tx?: DbTransactionClient): Promise<Tag | null> {
    return this.client(tx).tag.findFirst({ where: { name } });
  }

  /**
   * Finds a tag by id.
   * @param id - Tag UUID
   * @param tx - Optional transaction client
   */
  async findById(id: string, tx?: DbTransactionClient): Promise<Tag | null> {
    return this.client(tx).tag.findUnique({ where: { id } });
  }

  /**
   * Returns every tag.
   * @param tx - Optional transaction client
   */
  async findAll(tx?: DbTransactionClient): Promise<Tag[]> {
    return this.client(tx).tag.findMany({});
  }

  /**
   * Creates a tag from a plain input shape.
   * Named `createTag` to avoid colliding with BaseRepository.create.
   * @param input - Tag name and optional color
   * @param tx - Optional transaction client
   */
  async createTag(
    input: { name: string; color?: string | null },
    tx?: DbTransactionClient,
  ): Promise<Tag> {
    return this.client(tx).tag.create({ data: input });
  }
}
