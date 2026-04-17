import { PaginationParams, PaginatedResult, PaginationMeta } from '@common/interfaces';
import { DEFAULT_PAGE, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '@common/constants';
import { PrismaService } from '@database/prisma.service';
import { Prisma } from '@prisma/client';
import { DbTransactionClient } from '@database/types';

interface PrismaDelegate<
  TModel,
  TCreateInput,
  TUpdateInput,
  TWhereUniqueInput,
  TWhereInput,
  TOrderByInput,
> {
  create(args: { data: TCreateInput; include?: Record<string, unknown> }): Promise<TModel>;
  findUnique(args: {
    where: TWhereUniqueInput;
    include?: Record<string, unknown>;
  }): Promise<TModel | null>;
  findFirst(args: {
    where?: TWhereInput;
    include?: Record<string, unknown>;
  }): Promise<TModel | null>;
  findMany(args: {
    where?: TWhereInput;
    orderBy?: TOrderByInput | TOrderByInput[];
    skip?: number;
    take?: number;
    include?: Record<string, unknown>;
  }): Promise<TModel[]>;
  update(args: { where: TWhereUniqueInput; data: TUpdateInput }): Promise<TModel>;
  delete(args: { where: TWhereUniqueInput }): Promise<TModel>;
  count(args?: { where?: TWhereInput }): Promise<number>;
}

export abstract class BaseRepository<
  TModel,
  TCreateInput,
  TUpdateInput,
  TWhereUniqueInput,
  TWhereInput,
  TOrderByInput,
> {
  constructor(protected readonly prisma: PrismaService) {}

  /**
   * Returns the Prisma delegate bound to either a transaction client or the
   * shared PrismaService. Concrete subclasses implement it, e.g.:
   *   return client.user;
   */
  protected abstract delegateFor(
    client: PrismaService | DbTransactionClient,
  ): PrismaDelegate<
    TModel,
    TCreateInput,
    TUpdateInput,
    TWhereUniqueInput,
    TWhereInput,
    TOrderByInput
  >;

  protected supportsSoftDelete = false;

  /** Resolves the active client (transaction override or default Prisma). */
  protected client(tx?: DbTransactionClient): PrismaService | DbTransactionClient {
    return tx ?? this.prisma;
  }

  async create(data: TCreateInput, tx?: DbTransactionClient): Promise<TModel> {
    return this.delegateFor(this.client(tx)).create({ data });
  }

  async findUnique(
    where: TWhereUniqueInput,
    include?: Record<string, unknown>,
    tx?: DbTransactionClient,
  ): Promise<TModel | null> {
    return this.delegateFor(this.client(tx)).findUnique({
      where,
      ...(include ? { include } : {}),
    });
  }

  async findFirst(
    where?: TWhereInput,
    include?: Record<string, unknown>,
    tx?: DbTransactionClient,
  ): Promise<TModel | null> {
    return this.delegateFor(this.client(tx)).findFirst({
      ...(where ? { where } : {}),
      ...(include ? { include } : {}),
    });
  }

  async findMany(
    where?: TWhereInput,
    orderBy?: TOrderByInput | TOrderByInput[],
    include?: Record<string, unknown>,
    tx?: DbTransactionClient,
  ): Promise<TModel[]> {
    return this.delegateFor(this.client(tx)).findMany({
      ...(where ? { where } : {}),
      ...(orderBy ? { orderBy } : {}),
      ...(include ? { include } : {}),
    });
  }

  async findManyPaginated(
    params: PaginationParams,
    where?: TWhereInput,
    include?: Record<string, unknown>,
    tx?: DbTransactionClient,
  ): Promise<PaginatedResult<TModel>> {
    const page = Math.max(1, params.page ?? DEFAULT_PAGE);
    const limit = Math.min(Math.max(1, params.limit ?? DEFAULT_PAGE_LIMIT), MAX_PAGE_LIMIT);
    const skip = (page - 1) * limit;
    const delegate = this.delegateFor(this.client(tx));

    const [data, total] = await Promise.all([
      delegate.findMany({
        ...(where ? { where } : {}),
        skip,
        take: limit,
        ...(include ? { include } : {}),
      }),
      delegate.count({ ...(where ? { where } : {}) }),
    ]);

    const totalPages = Math.ceil(total / limit);
    const meta: PaginationMeta = {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
    return { data, meta };
  }

  async update(
    where: TWhereUniqueInput,
    data: TUpdateInput,
    tx?: DbTransactionClient,
  ): Promise<TModel> {
    return this.delegateFor(this.client(tx)).update({ where, data });
  }

  async delete(where: TWhereUniqueInput, tx?: DbTransactionClient): Promise<TModel> {
    return this.delegateFor(this.client(tx)).delete({ where });
  }

  async softDelete(where: TWhereUniqueInput, tx?: DbTransactionClient): Promise<TModel> {
    return this.delegateFor(this.client(tx)).update({
      where,
      data: { deletedAt: new Date() } as unknown as TUpdateInput,
    });
  }

  async restore(where: TWhereUniqueInput, tx?: DbTransactionClient): Promise<TModel> {
    return this.delegateFor(this.client(tx)).update({
      where,
      data: { deletedAt: null } as unknown as TUpdateInput,
    });
  }

  async count(where?: TWhereInput, tx?: DbTransactionClient): Promise<number> {
    return this.delegateFor(this.client(tx)).count({ ...(where ? { where } : {}) });
  }

  async exists(where?: TWhereInput, tx?: DbTransactionClient): Promise<boolean> {
    const cnt = await this.delegateFor(this.client(tx)).count({
      ...(where ? { where } : {}),
    });
    return cnt > 0;
  }

  /**
   * Execute a callback within a Prisma transaction.
   * Prefer `DatabaseService.runInTransaction(...)` from outside the DB layer.
   */
  async withTransaction<R>(
    fn: (tx: Prisma.TransactionClient) => Promise<R>,
    options?: { timeout?: number },
  ): Promise<R> {
    return this.prisma.$transaction(fn, {
      timeout: options?.timeout ?? 10000,
    });
  }
}
