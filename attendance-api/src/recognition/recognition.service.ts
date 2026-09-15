import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { EmbeddingsService } from './embeddings.service';
import { LivenessService } from './liveness.service';
import { ComprefaceService } from './compreface.service';
import { cosineSimilarity, parsePgVector, toPgVector } from '../common/math';
import { DatabaseInitService } from '../database/database-init.service';

export type MatchRow = {
  employee_id: string;
  code: string;
  display_name: string;
  cosine_sim: number;
};

@Injectable()
export class RecognitionService {
  private readonly logger = new Logger(RecognitionService.name);
  readonly metrics = {
    identifyTotal: 0,
    identifyAccepted: 0,
    identifyRejected: 0,
  };

  constructor(
    private readonly config: ConfigService,
    private readonly embeddings: EmbeddingsService,
    private readonly liveness: LivenessService,
    private readonly compreface: ComprefaceService,
    private readonly ds: DataSource,
    private readonly dbInit: DatabaseInitService,
  ) {}

  thresholds() {
    return {
      similarity: this.config.get<number>('recognition.similarityThreshold') || 0.97,
      liveness: this.config.get<number>('recognition.livenessThreshold') || 0.6,
      topK: this.config.get<number>('recognition.topK') || 5,
    };
  }

  async embedAndLiveness(imageBuf: Buffer, clientLiveness?: number) {
    const [embedding, liveness_score] = await Promise.all([
      this.embeddings.embed(imageBuf),
      this.liveness.score(imageBuf, clientLiveness),
    ]);
    return { embedding, liveness_score };
  }

  async enrollInternal(employeeId: string, employeeCode: string, imageBuf: Buffer, liveness?: number) {
    const { embedding, liveness_score } = await this.embedAndLiveness(imageBuf, liveness);
    if (this.compreface.enabled()) {
      await this.compreface.enroll(employeeCode, imageBuf);
    }
    await this.ds.query(
      `INSERT INTO face_templates (employee_id, embedding, liveness_score)
       VALUES ($1, $2, $3)`,
      [employeeId, toPgVector(embedding), liveness_score],
    );
    return { liveness_score };
  }

  async identify(
    imageBuf: Buffer,
    opts?: { embedding?: number[]; clientLiveness?: number },
  ): Promise<{
    ok: boolean;
    reason?: string;
    embedding: number[];
    liveness: number;
    similarity: number;
    match?: MatchRow;
    top: MatchRow[];
  }> {
    this.metrics.identifyTotal += 1;
    const th = this.thresholds();
    const liveness =
      imageBuf && imageBuf.length > 32
        ? await this.liveness.score(imageBuf, opts?.clientLiveness)
        : Math.max(0, Math.min(1, opts?.clientLiveness ?? 1));
    let embedding = opts?.embedding;
    if (!embedding || embedding.length === 0) {
      if (!imageBuf || imageBuf.length < 32) {
        return {
          ok: false,
          reason: 'missing_image',
          embedding: [],
          liveness,
          similarity: 0,
          top: [],
        };
      }
      embedding = await this.embeddings.embed(imageBuf);
    }

    if (this.compreface.enabled()) {
      const rec = await this.compreface.recognize(imageBuf);
      if (rec) {
        const rows = await this.ds.query(
          `SELECT id, code, display_name FROM employees WHERE code = $1 AND status = 'active' LIMIT 1`,
          [rec.subject],
        );
        if (rows[0]) {
          const match: MatchRow = {
            employee_id: rows[0].id,
            code: rows[0].code,
            display_name: rows[0].display_name,
            cosine_sim: rec.similarity,
          };
          const ok = rec.similarity >= th.similarity && liveness >= th.liveness;
          if (ok) this.metrics.identifyAccepted += 1;
          else this.metrics.identifyRejected += 1;
          return {
            ok,
            reason: ok ? undefined : rec.similarity < th.similarity ? 'low_similarity' : 'low_liveness',
            embedding,
            liveness,
            similarity: rec.similarity,
            match: ok ? match : match,
            top: [match],
          };
        }
      }
    }

    const top = await this.search(embedding, th.topK);
    const best = top[0];
    const similarity = best?.cosine_sim ?? 0;
    const ok = !!best && similarity >= th.similarity && liveness >= th.liveness;
    if (ok) this.metrics.identifyAccepted += 1;
    else this.metrics.identifyRejected += 1;

    let reason: string | undefined;
    if (!best) reason = 'no_templates';
    else if (liveness < th.liveness) reason = 'low_liveness';
    else if (similarity < th.similarity) reason = 'low_similarity';

    this.logger.log(
      JSON.stringify({
        event: 'identify',
        ok,
        similarity: Number(similarity.toFixed(4)),
        liveness,
        employee_id: best?.employee_id,
        reason,
      }),
    );

    return {
      ok,
      reason,
      embedding,
      liveness,
      similarity,
      match: best,
      top,
    };
  }

  async verify(employeeId: string, imageBuf: Buffer, clientLiveness?: number) {
    const { embedding, liveness_score } = await this.embedAndLiveness(imageBuf, clientLiveness);
    const rows = await this.ds.query(
      `SELECT embedding FROM face_templates WHERE employee_id = $1`,
      [employeeId],
    );
    let best = 0;
    for (const row of rows) {
      const sim = cosineSimilarity(embedding, parsePgVector(row.embedding));
      if (sim > best) best = sim;
    }
    const th = this.thresholds();
    const ok = best >= th.similarity && liveness_score >= th.liveness;
    return { ok, similarity: best, liveness: liveness_score, employee_id: employeeId };
  }

  private async search(probe: number[], limit: number): Promise<MatchRow[]> {
    const probeVec = toPgVector(probe);
    if (this.dbInit.pgvectorEnabled) {
      try {
        const rows = await this.ds.query(
          `SELECT e.id AS employee_id, e.code, e.display_name,
                  1 - (ft.embedding <=> $1::vector) AS cosine_sim
             FROM face_templates ft
             JOIN employees e ON e.id = ft.employee_id
            WHERE e.status = 'active'
            ORDER BY ft.embedding <-> $1::vector
            LIMIT $2`,
          [probeVec, limit],
        );
        return this.dedupeEmployees(rows);
      } catch (err) {
        this.logger.warn(`pgvector search failed: ${(err as Error).message}`);
      }
    }

    const rows = await this.ds.query(
      `SELECT e.id AS employee_id, e.code, e.display_name, ft.embedding
         FROM face_templates ft
         JOIN employees e ON e.id = ft.employee_id
        WHERE e.status = 'active'`,
    );
    const scored: MatchRow[] = rows.map((r: { employee_id: string; code: string; display_name: string; embedding: string }) => ({
      employee_id: r.employee_id,
      code: r.code,
      display_name: r.display_name,
      cosine_sim: cosineSimilarity(probe, parsePgVector(r.embedding)),
    }));
    scored.sort((a, b) => b.cosine_sim - a.cosine_sim);
    return this.dedupeEmployees(scored).slice(0, limit);
  }

  private dedupeEmployees(rows: MatchRow[]): MatchRow[] {
    const seen = new Set<string>();
    const out: MatchRow[] = [];
    for (const row of rows) {
      if (seen.has(row.employee_id)) continue;
      seen.add(row.employee_id);
      out.push({
        ...row,
        cosine_sim: Number(row.cosine_sim),
      });
    }
    return out;
  }
}
