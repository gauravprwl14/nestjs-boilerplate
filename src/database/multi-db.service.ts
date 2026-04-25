import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { AppConfigService } from '@config/config.service';
import { AppLogger } from '@logger/logger.service';
import { PoolConfig } from '@database/interfaces';

/**
 * Central pool manager for the multi-tier Postgres topology.
 *
 * Pool layout:
 * - **primary** (max 20) — single write source; all mutations go here.
 * - **replica-1 / replica-2** (max 15 each) — streaming replicas for read
 *   queries; distributed round-robin to spread load evenly.
 * - **metadata** (max 10) — warm-tier archive DB holding order summaries
 *   (no item details) for orders older than 90 days.
 * - **archive pools** (max 5 each, lazy) — one pool per cold-archive year-shard,
 *   created on first access and cached by "host:port:database" key.
 *
 * All fixed pools are created during `onModuleInit` and torn down in
 * `onModuleDestroy`.  Cold archive pools are created lazily via `getArchivePool`.
 */
@Injectable()
export class MultiDbService implements OnModuleInit, OnModuleDestroy {
  /** Write pool — routes every mutation to the primary Postgres server. */
  private primaryPool!: Pool;
  /** Read replica pools; populated during onModuleInit with replica-1 and replica-2. */
  private replicaPools: Pool[] = [];
  /** Warm-tier metadata pool for the metadata archive database. */
  private metadataPool!: Pool;
  /** Lazily-initialised cold archive pools keyed by "host:port:database". */
  private archivePools = new Map<string, Pool>();
  /** Monotonically incrementing counter used to implement round-robin replica selection. */
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

  /**
   * Constructs a pg.Pool with standardised timeouts applied to every tier.
   * idleTimeoutMillis=30 s releases idle connections quickly to avoid hitting
   * server-side max_connections; connectionTimeoutMillis=5 s surfaces pool
   * exhaustion as a fast error rather than an indefinite hang.
   *
   * @param cfg - Pool connection parameters including optional max client count
   * @returns A configured but not yet verified pg.Pool
   */
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

  /**
   * Acquires a single client from the given pool and executes SELECT 1 to
   * confirm the server is reachable before accepting traffic.
   *
   * @param pool - The pool to probe
   * @param name - Human-readable name used in log events (e.g. "primary")
   * @throws If the connection cannot be established within connectionTimeoutMillis
   */
  private async verifyPool(pool: Pool, name: string): Promise<void> {
    const client: PoolClient = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    this.logger.logEvent('db.pool.verified', { attributes: { name } });
  }
}
