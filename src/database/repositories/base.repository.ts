import { PaginationParams, PaginatedResult, PaginationMeta } from '@common/interfaces';
import { DEFAULT_PAGE, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '@common/constants';
import { PrismaService } from '@database/prisma.service';
import { Prisma } from '@prisma/client';

/**
 * Delegate interface that each concrete delegate (e.g. prisma.user) must satisfy.
 */
interface PrismaDelegate<
  TModel,
  TCreateInput,
  TUpdateInput,
  TWhereUniqueInput,
  TWhereInput,
  TOrderByInput,
> {
  create(args: { data: TCreateInput; include?: Record<string, unknown> }): Promise<TModel>;
  findUnique(args: { where: TWhereUniqueInput; include?: Record<string, unknown> }): Promise<TModel | null>;
  findFirst(args: { where?: TWhereInput; include?: Record<string, unknown> }): Promise<TModel | null>;
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

/**
 * Abstract generic base repository providing common CRUD operations.
 *
 * @typeParam TModel              - Prisma model type
 * @typeParam TCreateInput        - Prisma create input type
 * @typeParam TUpdateInput        - Prisma update input type
 * @typeParam TWhereUniqueInput   - Prisma where unique input type
 * @typeParam TWhereInput         - Prisma where input type
 * @typeParam TOrderByInput       - Prisma order-by input type
 */
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
   * Returns the Prisma delegate for the model (e.g. `this.prisma.user`).
   * Must be implemented by each concrete repository.
   */
  protected abstract get delegate(): PrismaDelegate<
    TModel,
    TCreateInput,
    TUpdateInput,
    TWhereUniqueInput,
    TWhereInput,
    TOrderByInput
  >;

  /**
   * Whether this repository supports soft-deletes (deletedAt field).
   * Override in concrete repositories that use soft deletes.
   */
  protected supportsSoftDelete = false;

  /**
   * Creates a new record.
   */
  async create(data: TCreateInput): Promise<TModel> {
    return this.delegate.create({ data });
  }

  /**
   * Finds a single record by its unique identifier.
   * @param where    - Unique filter
   * @param include  - Optional relations to include
   */
  async findUnique(
    where: TWhereUniqueInput,
    include?: Record<string, unknown>,
  ): Promise<TModel | null> {
    return this.delegate.findUnique({ where, ...(include ? { include } : {}) });
  }

  /**
   * Finds the first record matching the given filter.
   * @param where    - Optional filter
   * @param include  - Optional relations to include
   */
  async findFirst(
    where?: TWhereInput,
    include?: Record<string, unknown>,
  ): Promise<TModel | null> {
    return this.delegate.findFirst({ ...(where ? { where } : {}), ...(include ? { include } : {}) });
  }

  /**
   * Finds all records matching the given filter.
   * @param where    - Optional filter
   * @param orderBy  - Optional ordering
   * @param include  - Optional relations to include
   */
  async findMany(
    where?: TWhereInput,
    orderBy?: TOrderByInput | TOrderByInput[],
    include?: Record<string, unknown>,
  ): Promise<TModel[]> {
    return this.delegate.findMany({
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
   */
  async findManyPaginated(
    params: PaginationParams,
    where?: TWhereInput,
    include?: Record<string, unknown>,
  ): Promise<PaginatedResult<TModel>> {
    const page = Math.max(1, params.page ?? DEFAULT_PAGE);
    const limit = Math.min(
      Math.max(1, params.limit ?? DEFAULT_PAGE_LIMIT),
      MAX_PAGE_LIMIT,
    );
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.delegate.findMany({
        ...(where ? { where } : {}),
        skip,
        take: limit,
        ...(include ? { include } : {}),
      }),
      this.delegate.count({ ...(where ? { where } : {}) }),
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
   */
  async update(where: TWhereUniqueInput, data: TUpdateInput): Promise<TModel> {
    return this.delegate.update({ where, data });
  }

  /**
   * Hard-deletes a record by its unique identifier.
   * @param where  - Unique filter
   */
  async delete(where: TWhereUniqueInput): Promise<TModel> {
    return this.delegate.delete({ where });
  }

  /**
   * Soft-deletes a record by setting `deletedAt` to the current timestamp.
   * Requires `supportsSoftDelete = true` and a model with a `deletedAt` field.
   * @param where  - Unique filter
   */
  async softDelete(where: TWhereUniqueInput): Promise<TModel> {
    return this.delegate.update({
      where,
      data: { deletedAt: new Date() } as unknown as TUpdateInput,
    });
  }

  /**
   * Restores a soft-deleted record by nulling `deletedAt`.
   * @param where  - Unique filter
   */
  async restore(where: TWhereUniqueInput): Promise<TModel> {
    return this.delegate.update({
      where,
      data: { deletedAt: null } as unknown as TUpdateInput,
    });
  }

  /**
   * Returns the count of records matching the given filter.
   * @param where  - Optional filter
   */
  async count(where?: TWhereInput): Promise<number> {
    return this.delegate.count({ ...(where ? { where } : {}) });
  }

  /**
   * Returns true if at least one record matches the given filter.
   * @param where  - Optional filter
   */
  async exists(where?: TWhereInput): Promise<boolean> {
    const cnt = await this.delegate.count({ ...(where ? { where } : {}) });
    return cnt > 0;
  }

  /**
   * Execute a callback within a Prisma transaction.
   * All database operations within the callback share the same transaction.
   *
   * @param fn - Callback receiving the transaction client
   * @param options - Optional transaction settings
   * @param options.timeout - Transaction timeout in milliseconds (default: 10 000)
   * @returns Result of the callback
   * @throws Re-throws any error after Prisma processing
   *
   * @example
   * ```typescript
   * await this.repository.withTransaction(async (tx) => {
   *   await tx.todoList.create({ data: listData });
   *   await tx.todoItem.createMany({ data: itemsData });
   * });
   * ```
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
