import { BadRequestException } from '@nestjs/common';
import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

export const COMPANY_EMAIL_DOMAIN = 'walkingtree.tech';
export const COMPANY_EMAIL_SUFFIX = `@${COMPANY_EMAIL_DOMAIN}`;
export const COMPANY_EMAIL_PATTERN = /^[a-z0-9._%+\-]+@walkingtree\.tech$/i;
export const COMPANY_EMAIL_MESSAGE =
  'Register with your official company email ending in @walkingtree.tech';

export function normalizeEmail(email: string): string {
  return String(email ?? '').trim().toLowerCase();
}

export function isCompanyEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf('@');
  if (at <= 0 || at !== normalized.indexOf('@')) return false;
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  return local.length > 0 && domain === COMPANY_EMAIL_DOMAIN && COMPANY_EMAIL_PATTERN.test(normalized);
}

export function assertCompanyEmail(email: string): string {
  const normalized = normalizeEmail(email);
  if (!isCompanyEmail(normalized)) {
    throw new BadRequestException(COMPANY_EMAIL_MESSAGE);
  }
  return normalized;
}

@ValidatorConstraint({ name: 'isCompanyEmail', async: false })
class IsCompanyEmailConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'string' && isCompanyEmail(value);
  }

  defaultMessage() {
    return COMPANY_EMAIL_MESSAGE;
  }
}

export function IsCompanyEmail(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCompanyEmail',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsCompanyEmailConstraint,
    });
  };
}
