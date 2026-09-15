import { nextEmployeeCode } from './employee-code';

describe('nextEmployeeCode', () => {
  it('starts at EMP001 when none exist', () => {
    expect(nextEmployeeCode([])).toBe('EMP001');
  });

  it('increments the highest EMP number', () => {
    expect(nextEmployeeCode(['EMP001', 'EMP002'])).toBe('EMP003');
  });

  it('ignores non-EMP codes', () => {
    expect(nextEmployeeCode(['HQ-1', 'EMP010', 'temp'])).toBe('EMP011');
  });
});
