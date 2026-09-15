/** Next EMP### code from existing employee codes (EMP001, EMP002, …). */
export function nextEmployeeCode(existingCodes: string[]): string {
  let max = 0;
  for (const code of existingCodes) {
    const m = /^EMP(\d+)$/i.exec(String(code || '').trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `EMP${String(max + 1).padStart(3, '0')}`;
}
