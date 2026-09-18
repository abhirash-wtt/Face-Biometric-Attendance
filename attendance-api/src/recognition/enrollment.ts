export const REQUIRED_ENROLL_POSES = ['straight', 'left', 'right'] as const;
export type EnrollPose = (typeof REQUIRED_ENROLL_POSES)[number];

export const REQUIRED_FACE_FEATURES = [
  'forehead',
  'left_eye',
  'right_eye',
  'nose',
  'mouth',
] as const;
export type FaceFeature = (typeof REQUIRED_FACE_FEATURES)[number];

export type EnrollmentSample = {
  pose?: string | null;
  features_complete?: boolean | null;
  features_coverage?: number | null;
  liveness_score?: number | null;
  created_at?: Date | string | null;
};

export type EnrollmentStatus = {
  enrollment_status: 'complete' | 'incomplete';
  enrollment_complete: boolean;
  required_poses: EnrollPose[];
  captured_poses: EnrollPose[];
  missing_poses: EnrollPose[];
  required_samples: number;
  required_features: FaceFeature[];
  features_complete: boolean;
};

export function isEnrollPose(value: unknown): value is EnrollPose {
  return typeof value === 'string' && (REQUIRED_ENROLL_POSES as readonly string[]).includes(value);
}

export function parseEnrollPose(value: unknown): EnrollPose | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return isEnrollPose(normalized) ? normalized : undefined;
}

export function poseLabel(pose: EnrollPose): string {
  if (pose === 'left') return 'looking left';
  if (pose === 'right') return 'looking right';
  return 'looking straight';
}

export function buildEnrollmentStatus(samples: EnrollmentSample[]): EnrollmentStatus {
  const captured = REQUIRED_ENROLL_POSES.filter((pose) =>
    samples.some((row) => row.pose === pose && row.features_complete),
  );
  const missing = REQUIRED_ENROLL_POSES.filter((pose) => !captured.includes(pose));
  const complete = missing.length === 0;
  return {
    enrollment_status: complete ? 'complete' : 'incomplete',
    enrollment_complete: complete,
    required_poses: [...REQUIRED_ENROLL_POSES],
    captured_poses: captured,
    missing_poses: missing,
    required_samples: REQUIRED_ENROLL_POSES.length,
    required_features: [...REQUIRED_FACE_FEATURES],
    features_complete: complete,
  };
}
