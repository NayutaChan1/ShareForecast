import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, QueryResultRow } from 'pg';

/**
 * Thin wrapper over a pg connection pool.
 *
 * The schema is owned by infra/postgres/init.sql, so an ORM would only add a
 * second, drifting definition of the same tables.
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const pg = this.config.get<{
      host: string;
      port: number;
      user: string;
      password: string;
      database: string;
    }>('postgres')!;

    this.pool = new Pool({ ...pg, max: 10, idleTimeoutMillis: 30_000 });
    this.pool.on('error', (err) => this.logger.error(`idle client error: ${err.message}`));
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  async query<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query<T>(sql, params);
    return result.rows;
  }

  async queryOne<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  async ping(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
