import { hashOtp, otpMatches, generateOtp, REGISTER_OTP_LENGTH } from './registration-otp';

describe('registration OTP', () => {
  it('generates a numeric code of the expected length', () => {
    const otp = generateOtp();
    expect(otp).toMatch(new RegExp(`^\\d{${REGISTER_OTP_LENGTH}}$`));
  });

  it('matches only the original code for that email', () => {
    const secret = 'test-secret';
    const hash = hashOtp('123456', 'priya@walkingtree.tech', secret);
    expect(otpMatches('123456', 'priya@walkingtree.tech', secret, hash)).toBe(true);
    expect(otpMatches('123457', 'priya@walkingtree.tech', secret, hash)).toBe(false);
    expect(otpMatches('123456', 'other@walkingtree.tech', secret, hash)).toBe(false);
  });
});
