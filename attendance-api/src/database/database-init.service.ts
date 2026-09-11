import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

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
