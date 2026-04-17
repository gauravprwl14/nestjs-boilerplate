import { PaginationParams, PaginatedResult, PaginationMeta } from '@common/interfaces';
import { DEFAULT_PAGE, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '@common/constants';
import { PrismaService } from '@database/prisma.service';
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

  /** Creates a new record. */
  async create(data: TCreateInput, tx?: DbTransactionClient): Promise<TModel> {
    return this.delegateFor(this.client(tx)).create({ data });
  }

  /**
   * Finds a single record by its unique identifier.
   * @param where    - Unique filter
   * @param include  - Optional relations to include
   * @param tx       - Optional transaction client
   */
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

  /**
   * Finds the first record matching the given filter.
   * @param where    - Optional filter
   * @param include  - Optional relations to include
   * @param tx       - Optional transaction client
   */
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

  /**
   * Finds all records matching the given filter.
   * @param where    - Optional filter
   * @param orderBy  - Optional ordering
   * @param include  - Optional relations to include
   * @param tx       - Optional transaction client
   */
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

  /**
   * Finds records with pagination support.
   * @param params   - Pagination, sort, and filter parameters
   * @param where    - Optional where filter
   * @param include  - Optional relations to include
   * @param tx       - Optional transaction client
   */
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

  /**
   * Updates a record by its unique identifier.
   * @param where  - Unique filter
   * @param data   - Update data
   * @param tx     - Optional transaction client
   */
  async update(
    where: TWhereUniqueInput,
    data: TUpdateInput,
    tx?: DbTransactionClient,
  ): Promise<TModel> {
    return this.delegateFor(this.client(tx)).update({ where, data });
  }

  /**
   * Hard-deletes a record by its unique identifier.
   * @param where  - Unique filter
   * @param tx     - Optional transaction client
   */
  async delete(where: TWhereUniqueInput, tx?: DbTransactionClient): Promise<TModel> {
    return this.delegateFor(this.client(tx)).delete({ where });
  }

  /**
   * Soft-deletes a record by setting `deletedAt` to the current timestamp.
   * Requires a model with a `deletedAt` field; the cast in the body sidesteps the
   * generic `TUpdateInput` constraint, so only call this on aggregates that opt in.
   * @param where  - Unique filter
   * @param tx     - Optional transaction client
   */
  async softDelete(where: TWhereUniqueInput, tx?: DbTransactionClient): Promise<TModel> {
    return this.delegateFor(this.client(tx)).update({
      where,
      data: { deletedAt: new Date() } as unknown as TUpdateInput,
    });
  }

  /**
   * Restores a soft-deleted record by nulling `deletedAt`.
   * @param where  - Unique filter
   * @param tx     - Optional transaction client
   */
  async restore(where: TWhereUniqueInput, tx?: DbTransactionClient): Promise<TModel> {
    return this.delegateFor(this.client(tx)).update({
      where,
      data: { deletedAt: null } as unknown as TUpdateInput,
    });
  }

  /**
   * Returns the count of records matching the given filter.
   * @param where  - Optional filter
   * @param tx     - Optional transaction client
   */
  async count(where?: TWhereInput, tx?: DbTransactionClient): Promise<number> {
    return this.delegateFor(this.client(tx)).count({ ...(where ? { where } : {}) });
  }

  /**
   * Returns true if at least one record matches the given filter.
   * @param where  - Optional filter
   * @param tx     - Optional transaction client
   */
  async exists(where?: TWhereInput, tx?: DbTransactionClient): Promise<boolean> {
    const cnt = await this.delegateFor(this.client(tx)).count({
      ...(where ? { where } : {}),
    });
    return cnt > 0;
  }

  /**
   * Execute a callback within a Prisma transaction.
   * Prefer `DatabaseService.runInTransaction(...)` from outside the DB layer.
   * @param fn       - Callback receiving the transaction client
   * @param options  - Transaction options (timeout in ms; default 10000)
   */
  async withTransaction<R>(
    fn: (tx: DbTransactionClient) => Promise<R>,
    options?: { timeout?: number },
  ): Promise<R> {
    return this.prisma.$transaction(fn, {
      timeout: options?.timeout ?? 10000,
    });
  }
}
