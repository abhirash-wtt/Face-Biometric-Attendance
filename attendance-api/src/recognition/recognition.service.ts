import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { EmbeddingsService } from './embeddings.service';
import { LivenessService } from './liveness.service';
import { ComprefaceService } from './compreface.service';
import { FaceQualityService } from './face-quality.service';
import {
  buildEnrollmentStatus,
  EnrollPose,
  EnrollmentStatus,
  poseLabel,
} from './enrollment';
import { cosineSimilarity, parsePgVector, toPgVector } from '../common/math';
import { DatabaseInitService } from '../database/database-init.service';

const POSE_DIVERSITY_MAX_SIM = 0.992;

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
    private readonly faceQuality: FaceQualityService,
    private readonly ds: DataSource,
    private readonly dbInit: DatabaseInitService,
  ) {}

  thresholds() {
    return {
      similarity: this.config.get<number>('recognition.similarityThreshold') ?? 0.9,
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

  async enrollmentSnapshot(employeeId: string): Promise<
    EnrollmentStatus & {
      samples: Array<{
        pose: string | null;
        features_complete: boolean;
        features_coverage: number | null;
        liveness_score: number | null;
        created_at: Date | string | null;
      }>;
      total_templates: number;
    }
  > {
    const rows = await this.ds.query(
      `SELECT pose, features_complete, features_coverage, liveness_score, created_at
         FROM face_templates
        WHERE employee_id = $1
        ORDER BY created_at ASC`,
      [employeeId],
    );
    const samples = (rows || []).map(
      (row: {
        pose: string | null;
        features_complete: boolean | null;
        features_coverage: number | null;
        liveness_score: number | null;
        created_at: Date | string | null;
      }) => ({
        pose: row.pose,
        features_complete: !!row.features_complete,
        features_coverage: row.features_coverage == null ? null : Number(row.features_coverage),
        liveness_score: row.liveness_score == null ? null : Number(row.liveness_score),
        created_at: row.created_at,
      }),
    );
    return {
      ...buildEnrollmentStatus(samples),
      samples,
      total_templates: samples.length,
    };
  }

  async isEnrollmentComplete(employeeId: string): Promise<boolean> {
    const snapshot = await this.enrollmentSnapshot(employeeId);
    return snapshot.enrollment_complete;
  }

  async enrollInternal(
    employeeId: string,
    employeeCode: string,
    imageBuf: Buffer,
    opts?: { liveness?: number; pose: EnrollPose },
  ) {
    const pose = opts?.pose;
    if (!pose) {
      throw new BadRequestException('Each sample must be one of: looking straight, left, or right');
    }

    const quality = await this.faceQuality.assess(imageBuf);
    if (!quality.ok) {
      throw new BadRequestException(
        quality.reason || 'Could not capture 100% of required facial features. Recapture this pose.',
      );
    }

    const { embedding, liveness_score } = await this.embedAndLiveness(imageBuf, opts?.liveness);
    await this.assertPoseDiversity(employeeId, pose, embedding);

    if (this.compreface.enabled()) {
      await this.compreface.enroll(employeeCode, imageBuf);
    }
    await this.ds.query(
      `INSERT INTO face_templates
         (employee_id, embedding, liveness_score, pose, features_coverage, features_complete)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       ON CONFLICT (employee_id, pose) WHERE pose IS NOT NULL
       DO UPDATE SET
         embedding = EXCLUDED.embedding,
         liveness_score = EXCLUDED.liveness_score,
         features_coverage = EXCLUDED.features_coverage,
         features_complete = TRUE,
         created_at = now()`,
      [employeeId, toPgVector(embedding), liveness_score, pose, quality.coverage],
    );
    return {
      liveness_score,
      pose,
      features_coverage: quality.coverage,
      features_complete: true,
      features_present: quality.present,
    };
  }

  private async assertPoseDiversity(employeeId: string, pose: EnrollPose, embedding: number[]) {
    const others = await this.ds.query(
      `SELECT pose, embedding FROM face_templates
        WHERE employee_id = $1 AND pose IS NOT NULL AND pose <> $2`,
      [employeeId, pose],
    );
    for (const row of others as Array<{ pose: string; embedding: string }>) {
      const sim = cosineSimilarity(embedding, parsePgVector(row.embedding));
      if (sim >= POSE_DIVERSITY_MAX_SIM) {
        throw new BadRequestException(
          `This capture is too similar to the ${poseLabel(row.pose as EnrollPose)} sample. ${
            pose === 'straight'
              ? 'Look straight at the camera.'
              : `Turn your head farther ${pose} and hold still.`
          }`,
        );
      }
    }
  }

  async clearEnrollments(employeeId: string, employeeCode: string) {
    if (this.compreface.enabled()) {
      await this.compreface.deleteSubject(employeeCode);
    }
    await this.ds.query('DELETE FROM face_templates WHERE employee_id = $1', [employeeId]);
  }

  async identify(
    imageBuf: Buffer,
    opts?: { embedding?: number[]; clientLiveness?: number; boundEmployeeId?: string },
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
    let embedding = opts?.embedding;
    let liveness: number;

    if (!embedding || embedding.length === 0) {
      if (!imageBuf || imageBuf.length < 32) {
        return {
          ok: false,
          reason: 'missing_image',
          embedding: [],
          liveness: Math.max(0, Math.min(1, opts?.clientLiveness ?? 1)),
          similarity: 0,
          top: [],
        };
      }
      // Run embed + liveness together — both only need a downscaled Sharp pass.
      const scored = await this.embedAndLiveness(imageBuf, opts?.clientLiveness);
      embedding = scored.embedding;
      liveness = scored.liveness_score;
    } else {
      liveness =
        imageBuf && imageBuf.length > 32
          ? await this.liveness.score(imageBuf, opts?.clientLiveness)
          : Math.max(0, Math.min(1, opts?.clientLiveness ?? 1));
    }

    if (opts?.boundEmployeeId) {
      return this.identifyBound(opts.boundEmployeeId, embedding, liveness);
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
          const enrollReason = await this.enrollmentBlockReason(match.employee_id);
          if (enrollReason) {
            this.metrics.identifyRejected += 1;
            return {
              ok: false,
              reason: enrollReason,
              embedding,
              liveness,
              similarity: rec.similarity,
              match,
              top: [match],
            };
          }
          const ok = rec.similarity >= th.similarity && liveness >= th.liveness;
          if (ok) this.metrics.identifyAccepted += 1;
          else this.metrics.identifyRejected += 1;
          return {
            ok,
            reason: ok ? undefined : rec.similarity < th.similarity ? 'low_similarity' : 'low_liveness',
            embedding,
            liveness,
            similarity: rec.similarity,
            match,
            top: [match],
          };
        }
      }
    }

    const top = await this.search(embedding, th.topK);
    const best = top[0];
    const similarity = best?.cosine_sim ?? 0;
    const enrollReason = best ? await this.enrollmentBlockReason(best.employee_id) : undefined;
    const ok =
      !!best && !enrollReason && similarity >= th.similarity && liveness >= th.liveness;
    if (ok) this.metrics.identifyAccepted += 1;
    else this.metrics.identifyRejected += 1;

    let reason: string | undefined;
    if (!best) {
      reason = 'no_templates';
    } else if (enrollReason) {
      reason = enrollReason;
    } else if (liveness < th.liveness) {
      reason = 'low_liveness';
    } else if (similarity < th.similarity) {
      if (this.embeddings.isModelActive()) {
        const tmpls = await this.ds.query(
          `SELECT embedding FROM face_templates WHERE employee_id = $1 LIMIT 5`,
          [best.employee_id],
        );
        if (tmpls.length > 0 && tmpls.every((t: { embedding: string }) => isLegacyTemplate(t.embedding))) {
          reason = 're_enroll_required';
        } else {
          reason = 'low_similarity';
        }
      } else {
        reason = 'low_similarity';
      }
    }

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
    const identified = await this.identifyBound(employeeId, embedding, liveness_score);
    return {
      ok: identified.ok,
      reason: identified.reason,
      similarity: identified.similarity,
      liveness: identified.liveness,
      employee_id: employeeId,
      match: identified.match,
    };
  }

  private async identifyBound(
    employeeId: string,
    embedding: number[],
    liveness: number,
  ): Promise<{
    ok: boolean;
    reason?: string;
    embedding: number[];
    liveness: number;
    similarity: number;
    match?: MatchRow;
    top: MatchRow[];
  }> {
    const th = this.thresholds();
    const employee = await this.ds.query(
      `SELECT id, code, display_name, status FROM employees WHERE id = $1 LIMIT 1`,
      [employeeId],
    );
    if (!employee[0] || employee[0].status !== 'active') {
      this.metrics.identifyRejected += 1;
      return {
        ok: false,
        reason: 'employee_not_found',
        embedding,
        liveness,
        similarity: 0,
        top: [],
      };
    }

    const top = await this.search(embedding, 1, employeeId);
    const best = top[0];
    const similarity = best?.cosine_sim ?? 0;
    const match: MatchRow = best || {
      employee_id: employee[0].id,
      code: employee[0].code,
      display_name: employee[0].display_name,
      cosine_sim: 0,
    };
    const enrollReason = await this.enrollmentBlockReason(employeeId);
    const ok =
      !!best && !enrollReason && similarity >= th.similarity && liveness >= th.liveness;
    if (ok) this.metrics.identifyAccepted += 1;
    else this.metrics.identifyRejected += 1;

    let reason: string | undefined;
    if (enrollReason) {
      reason = enrollReason;
    } else if (!best) {
      reason = 'no_templates';
    } else if (this.embeddings.isModelActive()) {
      const tmpls = await this.ds.query(
        `SELECT embedding FROM face_templates WHERE employee_id = $1 LIMIT 5`,
        [employeeId],
      );
      if (tmpls.length > 0 && tmpls.every((t: { embedding: string }) => isLegacyTemplate(t.embedding))) {
        reason = 're_enroll_required';
      } else if (liveness < th.liveness) {
        reason = 'low_liveness';
      } else if (similarity < th.similarity) {
        reason = 'identity_mismatch';
      }
    } else if (liveness < th.liveness) {
      reason = 'low_liveness';
    } else if (similarity < th.similarity) {
      reason = 'identity_mismatch';
    }

    this.logger.log(
      JSON.stringify({
        event: 'identify_bound',
        ok,
        similarity: Number(similarity.toFixed(4)),
        liveness,
        employee_id: employeeId,
        reason,
      }),
    );

    return {
      ok,
      reason,
      embedding,
      liveness,
      similarity,
      match,
      top: best ? [match] : [],
    };
  }

  private async search(probe: number[], limit: number, employeeId?: string): Promise<MatchRow[]> {
    const probeVec = toPgVector(probe);
    if (this.dbInit.pgvectorEnabled) {
      try {
        const rows = await this.ds.query(
          `SELECT e.id AS employee_id, e.code, e.display_name,
                  1 - (ft.embedding <=> $1::vector) AS cosine_sim
             FROM face_templates ft
             JOIN employees e ON e.id = ft.employee_id
            WHERE e.status = 'active'
              AND ($3::uuid IS NULL OR e.id = $3)
            ORDER BY ft.embedding <-> $1::vector
            LIMIT $2`,
          [probeVec, limit, employeeId ?? null],
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
        WHERE e.status = 'active'
          AND ($1::uuid IS NULL OR e.id = $1)`,
      [employeeId ?? null],
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

  private async enrollmentBlockReason(
    employeeId: string,
  ): Promise<'no_templates' | 'enrollment_incomplete' | undefined> {
    const snapshot = await this.enrollmentSnapshot(employeeId);
    if (snapshot.total_templates === 0) return 'no_templates';
    if (!snapshot.enrollment_complete) return 'enrollment_incomplete';
    return undefined;
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

function isLegacyTemplate(embeddingStr: string): boolean {
  try {
    const raw = parsePgVector(embeddingStr);
    if (raw.length !== 512) return false;
    let trailingZeros = 0;
    for (let i = 448; i < 512; i++) {
      if (raw[i] === 0) trailingZeros++;
    }
    return trailingZeros >= 60;
  } catch {
    return false;
  }
}
