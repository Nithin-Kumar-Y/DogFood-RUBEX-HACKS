import Database from 'better-sqlite3';
import { Pool } from 'pg';
import { config } from '../config';

export interface IDatabase {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  get<T = any>(sql: string, params?: any[]): Promise<T | null>;
  run(sql: string, params?: any[]): Promise<{ changes: number; lastInsertRowid?: number | bigint }>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

class SQLiteAdapter implements IDatabase {
  private db: Database.Database;

  constructor(filePath: string) {
    this.db = new Database(filePath);
    // Performance optimizations and integrity
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('synchronous = NORMAL');
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    // Normalise Postgres $1, $2 params to ? if needed
    const normalizedSql = sql.replace(/\$\d+/g, '?');
    const stmt = this.db.prepare(normalizedSql);
    return stmt.all(...params) as T[];
  }

  async get<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const normalizedSql = sql.replace(/\$\d+/g, '?');
    const stmt = this.db.prepare(normalizedSql);
    const result = stmt.get(...params);
    return (result as T) || null;
  }

  async run(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid?: number | bigint }> {
    const normalizedSql = sql.replace(/\$\d+/g, '?');
    const stmt = this.db.prepare(normalizedSql);
    const info = stmt.run(...params);
    return {
      changes: info.changes,
      lastInsertRowid: info.lastInsertRowid
    };
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

class PostgresAdapter implements IDatabase {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    // Convert ? to $1, $2 if needed
    let paramIdx = 1;
    const pgSql = sql.replace(/\?/g, () => `$${paramIdx++}`);
    const res = await this.pool.query(pgSql, params);
    return res.rows as T[];
  }

  async get<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  async run(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid?: number | bigint }> {
    let paramIdx = 1;
    const pgSql = sql.replace(/\?/g, () => `$${paramIdx++}`);
    const res = await this.pool.query(pgSql, params);
    return {
      changes: res.rowCount || 0
    };
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

let dbInstance: IDatabase | null = null;

export function getDatabase(): IDatabase {
  if (!dbInstance) {
    if (config.databaseType === 'postgres' && config.databaseUrl) {
      console.log('Connecting to PostgreSQL database...');
      dbInstance = new PostgresAdapter(config.databaseUrl);
    } else {
      console.log(`Using SQLite relational database at: ${config.sqlitePath}`);
      dbInstance = new SQLiteAdapter(config.sqlitePath);
    }
  }
  return dbInstance;
}
