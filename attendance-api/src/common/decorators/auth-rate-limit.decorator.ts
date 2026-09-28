import { ExecutionContext, SetMetadata } from '@nestjs/common';

export const AUTH_RATE_LIMIT = 'authRateLimit';

/** Applies the stricter "auth" throttler to credential and OTP endpoints. */
export const AuthRateLimit = () => SetMetadata(AUTH_RATE_LIMIT, true);

export function isAuthRateLimited(context: ExecutionContext): boolean {
  return Reflect.getMetadata(AUTH_RATE_LIMIT, context.getHandler()) === true;
}
