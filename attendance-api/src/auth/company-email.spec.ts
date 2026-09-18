import { assertCompanyEmail, COMPANY_EMAIL_MESSAGE, isCompanyEmail, normalizeEmail } from './company-email';

describe('company email', () => {
  it('accepts official Walking Tree addresses', () => {
    expect(isCompanyEmail('priya.sharma@walkingtree.tech')).toBe(true);
    expect(isCompanyEmail('  Abhirash.Garg@WalkingTree.TECH ')).toBe(true);
    expect(isCompanyEmail('user+tag@walkingtree.tech')).toBe(true);
  });

  it('rejects personal and lookalike domains', () => {
    expect(isCompanyEmail('user@gmail.com')).toBe(false);
    expect(isCompanyEmail('user@walkingtree.tech.evil.com')).toBe(false);
    expect(isCompanyEmail('user@mail.walkingtree.tech')).toBe(false);
    expect(isCompanyEmail('user@walkingtree.com')).toBe(false);
    expect(isCompanyEmail('user@gmail.com@walkingtree.tech')).toBe(false);
    expect(isCompanyEmail('@walkingtree.tech')).toBe(false);
    expect(isCompanyEmail('')).toBe(false);
  });

  it('normalizes and asserts the company domain', () => {
    expect(normalizeEmail('  Priya@WalkingTree.TECH ')).toBe('priya@walkingtree.tech');
    expect(assertCompanyEmail('priya@walkingtree.tech')).toBe('priya@walkingtree.tech');
    expect(() => assertCompanyEmail('priya@gmail.com')).toThrow(COMPANY_EMAIL_MESSAGE);
  });
});
