import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { SQLInputValue } from 'node:sqlite';
import type { RawRow } from './brokerTypes.js';
import { PilotStore } from './store.js';
import type { CollectionPath, Query, Transaction } from './store.js';

interface SqlitePilotStoreOptions {
  dbPath: string;
  now?: () => number;
}

const VALID_FIELD_RE = /^[a-zA-Z0-9_]{1,64}$/;

function splitRef(ref: string): { collection: string; docId: string } {
  const slash = ref.lastIndexOf('/');
  if (slash <= 0 || slash === ref.length - 1) {
    throw new Error('Invalid document reference path');
  }
  return { collection: ref.slice(0, slash), docId: ref.slice(slash + 1) };
}

function sqlFieldPath(field: string): string {
  if (!VALID_FIELD_RE.test(field)) {
    throw new Error('Invalid query field name');
  }
  return `$.${field}`;
}

export class SqlitePilotStore extends PilotStore {
  private readonly db: DatabaseSync;
  private serial: Promise<unknown> = Promise.resolve();
  private closed = false;

  constructor(options: SqlitePilotStoreOptions) {
    super(options.now ?? Date.now);
    const dbPath = options.dbPath.trim();
    if (!dbPath) throw new Error('SQLite database path is required');
    if (dbPath !== ':memory:') {
      const dir = dirname(dbPath);
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      if (process.platform !== 'win32') {
        chmodSync(dir, 0o700);
      }
    }
    this.db = new DatabaseSync(dbPath);
    if (dbPath !== ':memory:' && process.platform !== 'win32') {
      chmodSync(dbPath, 0o600);
    }
    this.db.exec(`
      PRAGMA busy_timeout = 5000;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS pilot_docs (
        ref TEXT PRIMARY KEY,
        collection TEXT NOT NULL,
        doc_id TEXT NOT NULL,
        data_json TEXT NOT NULL,
        owner_uid TEXT GENERATED ALWAYS AS (json_extract(data_json, '$.ownerUid')) VIRTUAL,
        connection_key TEXT GENERATED ALWAYS AS (json_extract(data_json, '$.connectionKey')) VIRTUAL,
        available_at REAL GENERATED ALWAYS AS (
          CASE
            WHEN json_type(data_json, '$.availableAt') IN ('integer', 'real')
            THEN CAST(json_extract(data_json, '$.availableAt') AS REAL)
            ELSE NULL
          END
        ) VIRTUAL,
        deal_id TEXT GENERATED ALWAYS AS (json_extract(data_json, '$.dealId')) VIRTUAL,
        payload_id TEXT GENERATED ALWAYS AS (json_extract(data_json, '$.id')) VIRTUAL
      );
      CREATE INDEX IF NOT EXISTS idx_pilot_coll_doc ON pilot_docs(collection, doc_id);
      CREATE INDEX IF NOT EXISTS idx_pilot_owner ON pilot_docs(collection, owner_uid, doc_id);
      CREATE INDEX IF NOT EXISTS idx_pilot_conn ON pilot_docs(collection, connection_key, doc_id);
      CREATE INDEX IF NOT EXISTS idx_pilot_avail ON pilot_docs(collection, available_at);
      CREATE INDEX IF NOT EXISTS idx_pilot_deal ON pilot_docs(collection, deal_id, doc_id);
      CREATE INDEX IF NOT EXISTS idx_pilot_pid ON pilot_docs(collection, payload_id, doc_id);
    `);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try {
      this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } catch {
      // Ignore checkpoint error if DB is already closing or read-only
    }
    this.db.close();
  }

  private readDoc<D>(ref: string): D | null {
    const row = this.db
      .prepare('SELECT data_json FROM pilot_docs WHERE ref = ?')
      .get(ref) as { data_json?: string } | undefined;
    return row?.data_json ? (JSON.parse(row.data_json) as D) : null;
  }

  protected transact<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    const run = this.serial.then(async (): Promise<T> => {
      if (this.closed) throw new Error('SQLite PilotStore is closed');
      const writes = new Map<string, { data: object; mask?: string[] } | null>();
      this.db.exec('BEGIN IMMEDIATE');
      try {
        const tx: Transaction = {
          get: async <D>(ref: string) => this.readDoc<D>(ref),
          getMany: async <D>(refs: string[]) => {
            const found = new Map<string, D>();
            const unique = [...new Set(refs)];
            if (unique.length === 0) return found;
            const select = this.db.prepare('SELECT data_json FROM pilot_docs WHERE ref = ?');
            for (const ref of unique) {
              const row = select.get(ref) as { data_json?: string } | undefined;
              if (row?.data_json) {
                found.set(ref, JSON.parse(row.data_json) as D);
              }
            }
            return found;
          },
          list: async <D>(collection: CollectionPath, query: Query) => {
            const pathExpr = sqlFieldPath(query.field);
            const clauses: string[] = ['collection = ?', "doc_id NOT LIKE '%/%'"];
            const params: SQLInputValue[] = [collection];

            if (query.after !== undefined) {
              clauses.push('doc_id > ?');
              params.push(query.after);
            }

            if (query.op === 'LESS_THAN_OR_EQUAL') {
              clauses.push(`json_type(data_json, ?) IN ('integer', 'real')`);
              params.push(pathExpr);
              clauses.push(`CAST(json_extract(data_json, ?) AS REAL) <= ?`);
              params.push(pathExpr, Number(query.value));
            } else if (query.op === 'IN') {
              const values = Array.isArray(query.value) ? query.value : [];
              if (values.length === 0) return [];
              const placeholders = values.map(() => '?').join(', ');
              clauses.push(`json_extract(data_json, ?) IN (${placeholders})`);
              params.push(pathExpr, ...values);
            } else {
              if (typeof query.value === 'boolean') {
                clauses.push(`json_type(data_json, ?) = ?`);
                params.push(pathExpr, query.value ? 'true' : 'false');
              } else {
                clauses.push(`json_extract(data_json, ?) = ?`);
                params.push(pathExpr, query.value as SQLInputValue);
              }
            }

            let sql = `SELECT doc_id, data_json FROM pilot_docs WHERE ${clauses.join(' AND ')} ORDER BY doc_id ASC`;
            if (query.limit !== undefined) {
              sql += ' LIMIT ?';
              params.push(Math.max(0, Math.floor(query.limit)));
            }

            const rows = this.db.prepare(sql).all(...params) as Array<{ doc_id: string; data_json: string }>;
            return rows.map((row) => ({
              id: row.doc_id,
              data: JSON.parse(row.data_json) as D,
            }));
          },
          put: (ref, data, mask) => {
            writes.set(ref, { data, mask });
          },
          delete: (ref) => {
            writes.set(ref, null);
          },
        };

        const result = await work(tx);

        const upsert = this.db.prepare(
          'INSERT INTO pilot_docs (ref, collection, doc_id, data_json) VALUES (?, ?, ?, ?) ' +
            'ON CONFLICT(ref) DO UPDATE SET data_json = excluded.data_json'
        );
        const remove = this.db.prepare('DELETE FROM pilot_docs WHERE ref = ?');

        for (const [ref, write] of writes) {
          if (write === null) {
            remove.run(ref);
            continue;
          }
          const { collection, docId } = splitRef(ref);
          let nextDoc: RawRow;
          if (write.mask && write.mask.length > 0) {
            const existing = this.readDoc<RawRow>(ref) ?? {};
            const patch = write.data as RawRow;
            nextDoc = { ...existing };
            for (const field of write.mask) {
              if (patch[field] === undefined) delete nextDoc[field];
              else nextDoc[field] = patch[field];
            }
          } else {
            nextDoc = write.data as RawRow;
          }
          upsert.run(ref, collection, docId, JSON.stringify(nextDoc));
        }

        this.db.exec('COMMIT');
        return result;
      } catch (error) {
        try {
          this.db.exec('ROLLBACK');
        } catch {
          // Ignore rollback error if transaction was never active
        }
        throw error;
      }
    });
    this.serial = run.catch(() => undefined);
    return run;
  }
}
