import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { HQ_OFFICE } from '../sites/hq-office';

@Injectable()
export class DatabaseInitService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseInitService.name);
  pgvectorEnabled = false;
  private schemaPromise: Promise<void> | null = null;

  constructor(private readonly ds: DataSource) {}

  async onModuleInit() {
    await this.ensureSchema();
  }

  ensureSchema(): Promise<void> {
    if (!this.schemaPromise) {
      this.schemaPromise = this.applySchema();
    }
    return this.schemaPromise;
  }

  private async applySchema() {
    const vectorSql = this.readSql('schema.sql');
    const fallbackSql = this.readSql('schema.fallback.sql');
    try {
      await this.ds.query('CREATE EXTENSION IF NOT EXISTS vector');
      await this.runStatements(vectorSql);
      this.pgvectorEnabled = true;
      this.logger.log('Schema applied with pgvector');
    } catch (err) {
      this.logger.warn(
        `pgvector unavailable (${(err as Error).message}). Applying fallback TEXT embeddings.`,
      );
      await this.runStatements(fallbackSql);
      this.pgvectorEnabled = false;
      this.logger.log('Schema applied with TEXT embeddings');
    }
    await this.migrateRoles();
    await this.migrateHqGeofence();
    await this.migrateUserEmployeeLink();
    await this.migrateWfhRegularization();
    await this.migrateRegularizationRequestType();
    await this.migrateEmployeeWorkingMode();
  }

  private async migrateRoles() {
    await this.ds.query(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN
          SELECT conname FROM pg_constraint
          WHERE conrelid = 'users'::regclass AND contype = 'c'
            AND pg_get_constraintdef(oid) ILIKE '%role%'
        LOOP
          EXECUTE format('ALTER TABLE users DROP CONSTRAINT IF EXISTS %I', r.conname);
        END LOOP;
      END $$;
    `);
    await this.ds.query(
      `UPDATE users SET role = 'user' WHERE role IS NULL OR role NOT IN ('admin', 'user')`,
    );
    await this.ds.query(`ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user'`);
    try {
      await this.ds.query(
        `ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'user'))`,
      );
    } catch (err) {
      const message = (err as Error).message || '';
      if (!/already exists/i.test(message)) throw err;
    }
    this.logger.log('RBAC roles migrated to admin | user');
  }

  private async migrateHqGeofence() {
    await this.ds.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS geofence_polygon JSONB`);
    await this.ds.query(
      `UPDATE sites
       SET name = $1, lat = $2, lng = $3, radius_m = $4, geofence_polygon = $5::jsonb
       WHERE code = 'HQ'`,
      [
        HQ_OFFICE.name,
        HQ_OFFICE.lat,
        HQ_OFFICE.lng,
        HQ_OFFICE.radius_m,
        JSON.stringify(HQ_OFFICE.geofence_polygon),
      ],
    );
    this.logger.log('HQ office geofence polygon applied');
  }

  private async migrateUserEmployeeLink() {
    await this.ds.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees(id) ON DELETE SET NULL`,
    );
  }

  private async migrateEmployeeWorkingMode() {
    await this.ds.query(
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS working_mode TEXT DEFAULT 'onsite'`,
    );
    await this.ds.query(
      `UPDATE employees SET working_mode = 'onsite' WHERE working_mode IS NULL OR working_mode NOT IN ('onsite', 'remote')`,
    );
    await this.ds.query(`ALTER TABLE employees ALTER COLUMN working_mode SET DEFAULT 'onsite'`);
    await this.ds.query(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN
          SELECT conname FROM pg_constraint
          WHERE conrelid = 'employees'::regclass AND contype = 'c'
            AND pg_get_constraintdef(oid) ILIKE '%working_mode%'
        LOOP
          EXECUTE format('ALTER TABLE employees DROP CONSTRAINT IF EXISTS %I', r.conname);
        END LOOP;
      END $$;
    `);
    try {
      await this.ds.query(
        `ALTER TABLE employees ADD CONSTRAINT employees_working_mode_check CHECK (working_mode IN ('onsite', 'remote'))`,
      );
    } catch (err) {
      const message = (err as Error).message || '';
      if (!/already exists/i.test(message)) throw err;
    }
    this.logger.log('Employee working_mode column ready');
  }

  private async migrateWfhRegularization() {
    await this.ds.query(`
      CREATE TABLE IF NOT EXISTS wfh_regularization_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        work_date DATE NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
        requested_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMPTZ,
        review_note TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `);
    await this.ds.query(`
      CREATE INDEX IF NOT EXISTS wfh_requests_employee_date_idx
        ON wfh_regularization_requests (employee_id, work_date)
    `);
    await this.ds.query(`
      CREATE INDEX IF NOT EXISTS wfh_requests_status_idx
        ON wfh_regularization_requests (status, created_at DESC)
    `);
    await this.ds.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS wfh_requests_active_uniq
        ON wfh_regularization_requests (employee_id, work_date)
        WHERE status IN ('pending', 'approved')
    `);
    this.logger.log('WFH regularization table ready');
  }

  private async migrateRegularizationRequestType() {
    await this.ds.query(
      `ALTER TABLE wfh_regularization_requests ADD COLUMN IF NOT EXISTS request_type TEXT DEFAULT 'wfh'`,
    );
    await this.ds.query(
      `UPDATE wfh_regularization_requests SET request_type = 'wfh' WHERE request_type IS NULL OR request_type NOT IN ('wfh', 'mark_present')`,
    );
    await this.ds.query(
      `ALTER TABLE wfh_regularization_requests ALTER COLUMN request_type SET DEFAULT 'wfh'`,
    );
    await this.ds.query(
      `ALTER TABLE wfh_regularization_requests ALTER COLUMN request_type SET NOT NULL`,
    );
    await this.ds.query(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN
          SELECT conname FROM pg_constraint
          WHERE conrelid = 'wfh_regularization_requests'::regclass AND contype = 'c'
            AND pg_get_constraintdef(oid) ILIKE '%request_type%'
        LOOP
          EXECUTE format('ALTER TABLE wfh_regularization_requests DROP CONSTRAINT IF EXISTS %I', r.conname);
        END LOOP;
      END $$;
    `);
    try {
      await this.ds.query(
        `ALTER TABLE wfh_regularization_requests ADD CONSTRAINT wfh_requests_type_check CHECK (request_type IN ('wfh', 'mark_present'))`,
      );
    } catch (err) {
      const message = (err as Error).message || '';
      if (!/already exists/i.test(message)) throw err;
    }
    await this.ds.query(`DROP INDEX IF EXISTS wfh_requests_active_uniq`);
    await this.ds.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS wfh_requests_active_uniq
        ON wfh_regularization_requests (employee_id, work_date, request_type)
        WHERE status IN ('pending', 'approved')
    `);
    this.logger.log('Regularization request_type column ready');
  }

  private readSql(file: string): string {
    const candidates = [
      path.join(__dirname, file),
      path.join(process.cwd(), 'src', 'database', file),
      path.join(process.cwd(), 'dist', 'database', file),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
    }
    throw new Error(`SQL file not found: ${file}`);
  }

  private async runStatements(sql: string) {
    const parts = sql
      .split(/;\s*(?:\r?\n|$)/)
      .map((s) =>
        s
          .split('\n')
          .filter((line) => !line.trim().startsWith('--'))
          .join('\n')
          .trim(),
      )
      .filter(Boolean);

    for (const statement of parts) {
      try {
        await this.ds.query(statement);
      } catch (err) {
        const message = (err as Error).message || '';
        if (/already exists/i.test(message)) continue;
        if (/ivfflat|vector/i.test(message)) {
          this.logger.warn(`Skipped statement: ${message}`);
          continue;
        }
        throw err;
      }
    }
  }
}
