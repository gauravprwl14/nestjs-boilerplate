import { Injectable } from '@nestjs/common';
import { Prisma, Tag } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { BaseRepository } from '@database/repositories/base.repository';

/**
 * Repository for Tag model operations.
 */
@Injectable()
export class TagsRepository extends BaseRepository<
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

  protected get delegate() {
    return this.prisma.tag;
  }
}
