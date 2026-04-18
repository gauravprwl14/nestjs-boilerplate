import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { BaseRepository } from '@database/base.repository';
import { DbTransactionClient } from '@database/types';
import { InstrumentClass } from '@telemetry/decorators/instrument-class.decorator';

/**
 * Shape the MockAuthMiddleware reads — the user's id, tenant, and direct
 * department memberships. Everything downstream in CLS derives from this.
 */
export interface UserAuthContext {
  id: string;
  companyId: string;
  email: string;
  name: string;
  departmentIds: string[];
}

/**
 * Repository for the User model. Only file outside src/database that touches
 * Prisma's user delegate.
 */
@InstrumentClass()
@Injectable()
export class UsersDbRepository extends BaseRepository<
  User,
  Prisma.UserCreateInput,
  Prisma.UserUpdateInput,
  Prisma.UserWhereUniqueInput,
  Prisma.UserWhereInput,
  Prisma.UserOrderByWithRelationInput
> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  protected delegateFor(client: PrismaService | DbTransactionClient) {
    return client.user;
  }

  /**
   * Loads the auth context for a user: id, company, and every department they
   * belong to. Returns null if the user does not exist. Used by MockAuthMiddleware
   * to populate CLS; NOT tenant-scoped since the middleware runs before tenant
   * context is established.
   *
   * @param id - User UUID
   * @param tx - Optional transaction client
   */
  async findAuthContext(id: string, tx?: DbTransactionClient): Promise<UserAuthContext | null> {
    const user = await this.client(tx).user.findUnique({
      where: { id },
      include: {
        departments: { select: { departmentId: true } },
      },
    });
    if (!user) return null;
    return {
      id: user.id,
      companyId: user.companyId,
      email: user.email,
      name: user.name,
      departmentIds: (
        user as unknown as { departments: Array<{ departmentId: string }> }
      ).departments.map(d => d.departmentId),
    };
  }
}
