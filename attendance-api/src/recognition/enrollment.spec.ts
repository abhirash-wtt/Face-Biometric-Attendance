import { buildEnrollmentStatus, isEnrollPose, parseEnrollPose } from './enrollment';

describe('enrollment status', () => {
  it('is incomplete until all three validated poses exist', () => {
    const status = buildEnrollmentStatus([
      { pose: 'straight', features_complete: true },
      { pose: 'left', features_complete: true },
    ]);
    expect(status.enrollment_complete).toBe(false);
    expect(status.enrollment_status).toBe('incomplete');
    expect(status.missing_poses).toEqual(['right']);
    expect(status.captured_poses).toEqual(['straight', 'left']);
  });

  it('ignores samples that failed feature processing', () => {
    const status = buildEnrollmentStatus([
      { pose: 'straight', features_complete: true },
      { pose: 'left', features_complete: false },
      { pose: 'right', features_complete: true },
    ]);
    expect(status.enrollment_complete).toBe(false);
    expect(status.missing_poses).toEqual(['left']);
  });

  it('ignores unlabeled legacy templates', () => {
    const status = buildEnrollmentStatus([
      { pose: null, features_complete: true },
      { pose: 'straight', features_complete: true },
    ]);
    expect(status.enrollment_complete).toBe(false);
    expect(status.captured_poses).toEqual(['straight']);
  });

  it('is complete when straight, left, and right samples are processed', () => {
    const status = buildEnrollmentStatus([
      { pose: 'right', features_complete: true },
      { pose: 'straight', features_complete: true },
      { pose: 'left', features_complete: true },
    ]);
    expect(status.enrollment_complete).toBe(true);
    expect(status.enrollment_status).toBe('complete');
    expect(status.missing_poses).toEqual([]);
    expect(status.features_complete).toBe(true);
  });
});

describe('pose parsing', () => {
  it('accepts the three required poses', () => {
    expect(isEnrollPose('straight')).toBe(true);
    expect(parseEnrollPose(' LEFT ')).toBe('left');
    expect(parseEnrollPose('Right')).toBe('right');
  });

  it('rejects unknown poses', () => {
    expect(parseEnrollPose('up')).toBeUndefined();
    expect(parseEnrollPose('')).toBeUndefined();
  });
});
