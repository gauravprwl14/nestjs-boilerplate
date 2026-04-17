import type { Prisma } from '@prisma/client';

/**
 * The opaque transaction handle a feature service threads through db-service calls.
 * Aliased so feature code never imports from '@prisma/client' directly.
 */
export type DbTransactionClient = Prisma.TransactionClient;
