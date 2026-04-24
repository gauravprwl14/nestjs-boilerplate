import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { AppConfigService } from '@config/config.service';
import { AppLogger } from '@logger/logger.service';
import { PoolConfig } from '@database/interfaces';

/**
 * Manages pg.Pool instances for the multi-tier database setup:
 * - primary: hot writes (max 20)
 * - replica-1, replica-2: reads via round-robin (max 15 each)
 * - metadata: warm tier (max 10)
 * - archive pools: cold tier, lazily initialised per DB (max 5 each)
 */
@Injectable()
export class MultiDbService implements OnModuleInit, OnModuleDestroy {
  private primaryPool!: Pool;
  private replicaPools: Pool[] = [];
  private metadataPool!: Pool;
  private archivePools = new Map<string, Pool>();
  private replicaCounter = 0;

  constructor(
    private readonly config: AppConfigService,
    private readonly logger: AppLogger,
  ) {}

  /** Connect all fixed pools on startup and verify primary with SELECT 1. */
  async onModuleInit(): Promise<void> {
    const cfg = this.config.get;

    this.primaryPool = this.createPool({
      host: cfg('DB_PRIMARY_HOST'),
      port: cfg('DB_PRIMARY_PORT'),
      database: cfg('DB_PRIMARY_NAME'),
      user: cfg('DB_PRIMARY_USER'),
      password: cfg('DB_PRIMARY_PASSWORD'),
      max: 20,
    });

    this.replicaPools = [
      this.createPool({
        host: cfg('DB_REPLICA_1_HOST'),
        port: cfg('DB_REPLICA_1_PORT'),
        database: cfg('DB_PRIMARY_NAME'),
        user: cfg('DB_PRIMARY_USER'),
        password: cfg('DB_PRIMARY_PASSWORD'),
        max: 15,
      }),
      this.createPool({
        host: cfg('DB_REPLICA_2_HOST'),
        port: cfg('DB_REPLICA_2_PORT'),
        database: cfg('DB_PRIMARY_NAME'),
        user: cfg('DB_PRIMARY_USER'),
        password: cfg('DB_PRIMARY_PASSWORD'),
        max: 15,
      }),
    ];

    this.metadataPool = this.createPool({
      host: cfg('DB_METADATA_HOST'),
      port: cfg('DB_METADATA_PORT'),
      database: cfg('DB_METADATA_NAME'),
      user: cfg('DB_METADATA_USER'),
      password: cfg('DB_METADATA_PASSWORD'),
      max: 10,
    });

    await this.verifyPool(this.primaryPool, 'primary');
    this.logger.logEvent('db.pools.initialized', {
      attributes: { pools: ['primary', 'replica-1', 'replica-2', 'metadata'] },
    });
  }

  /** End all pools gracefully on shutdown. */
  async onModuleDestroy(): Promise<void> {
    const all = [
      this.primaryPool,
      ...this.replicaPools,
      this.metadataPool,
      ...this.archivePools.values(),
    ];
    await Promise.allSettled(all.map(p => p.end()));
    this.logger.logEvent('db.pools.closed');
  }

  /**
   * Write path — always returns the primary pool.
   *
   * @returns The primary pg.Pool instance
   */
  getPrimaryPool(): Pool {
    return this.primaryPool;
  }

  /**
   * Read path — round-robin across replica-1 and replica-2.
   * Falls back to primary when no replicas are configured.
   *
   * @returns A replica pg.Pool (or primary as fallback)
   */
  getReadPool(): Pool {
    if (this.replicaPools.length === 0) return this.primaryPool;
    const idx = this.replicaCounter % this.replicaPools.length;
    this.replicaCounter = (this.replicaCounter + 1) % this.replicaPools.length;
    return this.replicaPools[idx];
  }

  /**
   * Warm tier — returns the metadata archive pool.
   *
   * @returns The metadata pg.Pool instance
   */
  getMetadataPool(): Pool {
    return this.metadataPool;
  }

  /**
   * Cold tier — returns a lazily-initialised pool keyed by "host:port:database".
   * Creates the pool on first access; subsequent calls return the cached instance.
   *
   * @param host - Archive DB host
   * @param port - Archive DB port
   * @param database - Archive DB name
   * @returns The pg.Pool instance for that archive database
   */
  getArchivePool(host: string, port: number, database: string): Pool {
    const key = `${host}:${port}:${database}`;
    if (!this.archivePools.has(key)) {
      const cfg = this.config.get;
      this.archivePools.set(
        key,
        this.createPool({
          host,
          port,
          database,
          user: cfg('DB_PRIMARY_USER'),
          password: cfg('DB_PRIMARY_PASSWORD'),
          max: 5,
        }),
      );
      this.logger.logEvent('db.archive-pool.created', { attributes: { key } });
    }
    return this.archivePools.get(key)!;
  }

  private createPool(cfg: PoolConfig): Pool {
    return new Pool({
      host: cfg.host,
      port: cfg.port,
      database: cfg.database,
      user: cfg.user,
      password: cfg.password,
      max: cfg.max ?? 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }

  private async verifyPool(pool: Pool, name: string): Promise<void> {
    const client: PoolClient = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    this.logger.logEvent('db.pool.verified', { attributes: { name } });
  }
}
