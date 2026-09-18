import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { hashOtp, registrationOtpKey } from './registration-otp';

jest.mock('./registration-otp', () => {
  const actual = jest.requireActual('./registration-otp');
  return {
    ...actual,
    generateOtp: jest.fn(() => '123456'),
  };
});

describe('AuthService registration OTP', () => {
  const email = 'priya.sharma@walkingtree.tech';
  const secret = 'access-secret';
  let service: AuthService;
  let users: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };
  let redis: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let mail: { sendRegistrationOtp: jest.Mock };
  let jwt: { sign: jest.Mock };
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    users = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
      create: jest.fn((row) => row),
    };
    redis = {
      get: jest.fn(async (key: string) => store.get(key) || null),
      set: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      del: jest.fn(async (key: string) => {
        store.delete(key);
      }),
    };
    mail = { sendRegistrationOtp: jest.fn().mockResolvedValue(undefined) };
    jwt = { sign: jest.fn(() => 'token') };
    const config = { get: jest.fn((key: string) => (key === 'jwt.accessSecret' ? secret : undefined)) };
    const employees = { findOne: jest.fn() };
    const dbInit = { ensureSchema: jest.fn() };
    const ds = {
      transaction: jest.fn(async (fn: (manager: unknown) => unknown) =>
        fn({
          find: jest.fn().mockResolvedValue([]),
          create: jest.fn((_cls: unknown, data: unknown) => data),
          save: jest.fn(async (_cls: unknown, data: Record<string, unknown>) => ({
            id: data.code ? 'emp-1' : 'user-1',
            ...data,
          })),
        }),
      ),
    };

    service = new AuthService(
      users as never,
      employees as never,
      jwt as never,
      config as never,
      redis as never,
      dbInit as never,
      ds as never,
      mail as never,
    );
  });

  it('rejects non-company emails before sending an OTP', async () => {
    await expect(service.startRegistration('priya@gmail.com', 'secret1', 'Priya')).rejects.toThrow(
      'Register with your official company email ending in @walkingtree.tech',
    );
    expect(mail.sendRegistrationOtp).not.toHaveBeenCalled();
  });

  it('rejects emails that are already registered', async () => {
    users.findOne.mockResolvedValue({ id: 'u1', email });
    await expect(service.startRegistration(email, 'secret1', 'Priya')).rejects.toBeInstanceOf(ConflictException);
    expect(mail.sendRegistrationOtp).not.toHaveBeenCalled();
  });

  it('emails an OTP and creates the account only after verification', async () => {
    const started = await service.startRegistration(email, 'secret1', 'Priya Sharma');
    expect(started).toEqual({
      status: 'otp_sent',
      email,
      expires_in: 600,
      resend_after: 45,
    });
    expect(mail.sendRegistrationOtp).toHaveBeenCalledWith(email, '123456');
    expect(store.has(registrationOtpKey(email))).toBe(true);

    await expect(service.verifyRegistration(email, '000000')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(users.findOne).toHaveBeenCalled();

    const tokens = await service.verifyRegistration(email, '123456');
    expect(tokens.access_token).toBe('token');
    expect(tokens.user.email).toBe(email);
    expect(store.has(registrationOtpKey(email))).toBe(false);
  });

  it('rejects a forged OTP hash for a different mailbox', () => {
    expect(
      hashOtp('123456', email, secret) === hashOtp('123456', 'other@walkingtree.tech', secret),
    ).toBe(false);
  });
});
