import { createHash, randomInt, timingSafeEqual } from 'crypto';

export const REGISTER_OTP_TTL_SEC = 10 * 60;
export const REGISTER_OTP_RESEND_SEC = 45;
export const REGISTER_OTP_MAX_ATTEMPTS = 5;
export const REGISTER_OTP_MAX_RESENDS = 8;
export const REGISTER_OTP_LENGTH = 6;

export type PendingRegistration = {
  displayName: string;
  passwordHash: string;
  otpHash: string;
  attempts: number;
  sentAt: number;
  resends: number;
};

export function registrationOtpKey(email: string): string {
  return `register-otp:${email}`;
}

export function generateOtp(length = REGISTER_OTP_LENGTH): string {
  const max = 10 ** length;
  return String(randomInt(0, max)).padStart(length, '0');
}

export function hashOtp(otp: string, email: string, secret: string): string {
  return createHash('sha256').update(`${otp}:${email}:${secret}`).digest('hex');
}

export function otpMatches(otp: string, email: string, secret: string, expectedHash: string): boolean {
  if (!expectedHash) return false;
  const actual = hashOtp(String(otp ?? '').trim(), email, secret);
  const a = Buffer.from(actual, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}
