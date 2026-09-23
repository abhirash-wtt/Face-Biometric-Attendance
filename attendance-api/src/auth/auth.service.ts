import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { User } from './user.entity';
import { Employee } from '../employees/employee.entity';
import { RedisService } from '../redis/redis.service';
import { JwtUser } from './jwt.strategy';
import { DatabaseInitService } from '../database/database-init.service';
import { nextEmployeeCode } from './employee-code';
import { MailService } from '../mail/mail.service';
import { assertCompanyEmail } from './company-email';
import {
  generateOtp,
  hashOtp,
  otpMatches,
  PendingRegistration,
  REGISTER_OTP_MAX_ATTEMPTS,
  REGISTER_OTP_MAX_RESENDS,
  REGISTER_OTP_RESEND_SEC,
  REGISTER_OTP_TTL_SEC,
  registrationOtpKey,
} from './registration-otp';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Employee) private readonly employees: Repository<Employee>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly dbInit: DatabaseInitService,
    private readonly ds: DataSource,
    private readonly mail: MailService,
  ) {}

  async onModuleInit() {
    await this.dbInit.ensureSchema();
    const email = this.config.get<string>('admin.email') || 'admin@attendance.local';
    const password = this.config.get<string>('admin.password') || 'Admin@123';
    const existing = await this.users.findOne({ where: { email } });
    if (!existing) {
      const password_hash = await bcrypt.hash(password, 10);
      await this.users.save(
        this.users.create({ email, password_hash, role: 'admin' }),
      );
      this.logger.log(`Seeded admin user ${email}`);
    }
    const userEmail = 'user@attendance.local';
    const existingUser = await this.users.findOne({ where: { email: userEmail } });
    if (!existingUser) {
      await this.users.save(
        this.users.create({
          email: userEmail,
          password_hash: await bcrypt.hash('User@123', 10),
          role: 'employee',
        }),
      );
      this.logger.log(`Seeded employee user ${userEmail}`);
    }
    const buEmail = 'bu@attendance.local';
    const existingBu = await this.users.findOne({ where: { email: buEmail } });
    if (!existingBu) {
      await this.users.save(
        this.users.create({
          email: buEmail,
          password_hash: await bcrypt.hash('Bu@123', 10),
          role: 'bu',
        }),
      );
      this.logger.log(`Seeded BU user ${buEmail}`);
    }
    const hrEmail = 'hrrole@gmail.com';
    await this.ensureRoleUser(hrEmail, 'vrSzijkmZf', 'hr', 'EMPHR', 'HR Role');
    const managerEmail = 'managerrole@gmail.com';
    await this.ensureRoleUser(managerEmail, 'V9wbSaSeEt', 'manager', 'EMPMGR', 'Manager Role');
  }

  private async ensureRoleUser(
    email: string,
    password: string,
    role: 'hr' | 'manager',
    employeeCode: string,
    displayName: string,
  ) {
    let employee = await this.employees.findOne({ where: { code: employeeCode } });
    if (!employee) {
      employee = await this.employees.save(
        this.employees.create({ code: employeeCode, display_name: displayName }),
      );
    }
    const existing = await this.users.findOne({ where: { email } });
    if (!existing) {
      await this.users.save(
        this.users.create({
          email,
          password_hash: await bcrypt.hash(password, 10),
          role,
          employee_id: employee.id,
        }),
      );
      this.logger.log(`Seeded ${role} user ${email}`);
      return;
    }
    let changed = false;
    if (existing.role !== role) {
      existing.role = role;
      changed = true;
    }
    if (existing.employee_id !== employee.id) {
      existing.employee_id = employee.id;
      changed = true;
    }
    if (changed) await this.users.save(existing);
  }

  async startRegistration(email: string, password: string, displayName: string) {
    const normalized = assertCompanyEmail(email);
    const name = displayName.trim();
    await this.assertEmailAvailable(normalized);

    const pending = await this.readPending(normalized);
    this.assertCanSendOtp(pending);

    const otp = generateOtp();
    const record: PendingRegistration = {
      displayName: name,
      passwordHash: await bcrypt.hash(password, 10),
      otpHash: hashOtp(otp, normalized, this.otpSecret()),
      attempts: 0,
      sentAt: Date.now(),
      resends: pending ? pending.resends + 1 : 0,
    };
    await this.savePending(normalized, record);
    await this.mail.sendRegistrationOtp(normalized, otp);
    return this.otpSentResponse(normalized);
  }

  async resendRegistrationOtp(email: string) {
    const normalized = assertCompanyEmail(email);
    await this.assertEmailAvailable(normalized);
    const pending = await this.readPending(normalized);
    if (!pending) {
      throw new BadRequestException('Start registration first so we can send a verification code');
    }
    this.assertCanSendOtp(pending);

    const otp = generateOtp();
    const record: PendingRegistration = {
      ...pending,
      otpHash: hashOtp(otp, normalized, this.otpSecret()),
      attempts: 0,
      sentAt: Date.now(),
      resends: pending.resends + 1,
    };
    await this.savePending(normalized, record);
    await this.mail.sendRegistrationOtp(normalized, otp);
    return this.otpSentResponse(normalized);
  }

  async verifyRegistration(email: string, otp: string) {
    const normalized = assertCompanyEmail(email);
    const pending = await this.readPending(normalized);
    if (!pending) {
      throw new UnauthorizedException('Invalid or expired verification code');
    }
    if (pending.attempts >= REGISTER_OTP_MAX_ATTEMPTS) {
      await this.redis.del(registrationOtpKey(normalized));
      throw new UnauthorizedException('Too many incorrect codes. Request a new verification code');
    }
    if (!otpMatches(otp, normalized, this.otpSecret(), pending.otpHash)) {
      pending.attempts += 1;
      await this.savePending(normalized, pending);
      const left = REGISTER_OTP_MAX_ATTEMPTS - pending.attempts;
      throw new UnauthorizedException(
        left > 0
          ? `Invalid verification code. ${left} attempt${left === 1 ? '' : 's'} remaining`
          : 'Too many incorrect codes. Request a new verification code',
      );
    }
    await this.redis.del(registrationOtpKey(normalized));
    return this.createRegisteredUser(normalized, pending.passwordHash, pending.displayName);
  }

  private async createRegisteredUser(email: string, passwordHash: string, displayName: string) {
    const existing = await this.users.findOne({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');

    let lastError: unknown;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const saved = await this.ds.transaction(async (manager) => {
          const codes = (await manager.find(Employee, { select: ['code'] })).map((e) => e.code);
          const employee = await manager.save(
            Employee,
            manager.create(Employee, {
              code: nextEmployeeCode(codes),
              display_name: displayName,
              status: 'active',
            }),
          );
          const user = await manager.save(
            User,
            manager.create(User, {
              email,
              password_hash: passwordHash,
              role: 'employee',
              employee_id: employee.id,
            }),
          );
          return { user, employee };
        });
        return this.issueUserTokens(saved.user, saved.employee);
      } catch (err) {
        lastError = err;
        const conflict = uniqueConstraint(err);
        if (conflict === 'email') throw new ConflictException('Email already registered');
        if (conflict === 'code') continue;
        throw err;
      }
    }
    throw lastError instanceof Error ? lastError : new ConflictException('Could not create account');
  }

  private async assertEmailAvailable(email: string) {
    const existing = await this.users.findOne({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');
  }

  private assertCanSendOtp(pending: PendingRegistration | null) {
    if (!pending) return;
    if (pending.resends >= REGISTER_OTP_MAX_RESENDS) {
      throw new HttpException(
        'Too many verification emails. Wait for the current code to expire, then try again',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const waitMs = REGISTER_OTP_RESEND_SEC * 1000 - (Date.now() - pending.sentAt);
    if (waitMs > 0) {
      const waitSec = Math.max(1, Math.ceil(waitMs / 1000));
      throw new HttpException(
        `A verification code was already sent. Try again in ${waitSec} second${waitSec === 1 ? '' : 's'}`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async readPending(email: string): Promise<PendingRegistration | null> {
    const raw = await this.redis.get(registrationOtpKey(email));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as PendingRegistration;
      if (!parsed?.passwordHash || !parsed?.otpHash || !parsed?.displayName) return null;
      return {
        displayName: parsed.displayName,
        passwordHash: parsed.passwordHash,
        otpHash: parsed.otpHash,
        attempts: Number(parsed.attempts) || 0,
        sentAt: Number(parsed.sentAt) || 0,
        resends: Number(parsed.resends) || 0,
      };
    } catch {
      return null;
    }
  }

  private savePending(email: string, record: PendingRegistration) {
    return this.redis.set(registrationOtpKey(email), JSON.stringify(record), REGISTER_OTP_TTL_SEC);
  }

  private otpSecret() {
    return this.config.get<string>('jwt.accessSecret') || 'change-me-access';
  }

  private otpSentResponse(email: string) {
    return {
      status: 'otp_sent' as const,
      email,
      expires_in: REGISTER_OTP_TTL_SEC,
      resend_after: REGISTER_OTP_RESEND_SEC,
    };
  }

  async login(email: string, password: string) {
    const user = await this.users.findOne({ where: { email: email.toLowerCase() } });
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueUserTokens(user);
  }

  async me(user: JwtUser) {
    const row = user.sub ? await this.users.findOne({ where: { id: user.sub } }) : null;
    const employee = row?.employee_id
      ? await this.employees.findOne({ where: { id: row.employee_id } })
      : null;
    return {
      ...user,
      role: row?.role || user.role,
      employee_id: row?.employee_id || user.employee_id || undefined,
      employee_code: employee?.code,
      display_name: employee?.display_name,
    };
  }

  async refresh(refreshToken: string) {
    const payload = await this.jwt.verifyAsync(refreshToken, {
      secret: this.config.get<string>('jwt.refreshSecret'),
    }).catch(() => {
      throw new UnauthorizedException('Invalid refresh token');
    });
    const stored = await this.redis.get(`refresh:${payload.jti}`);
    if (!stored || stored !== payload.sub) {
      throw new UnauthorizedException('Refresh token revoked');
    }
    const user = await this.users.findOne({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException();
    await this.redis.del(`refresh:${payload.jti}`);
    return this.issueUserTokens(user);
  }

  issueDeviceToken(deviceId: string, siteCode?: string) {
    const payload: JwtUser = {
      sub: deviceId,
      role: 'kiosk',
      type: 'device',
      device_id: deviceId,
      site_code: siteCode,
    };
    const access_token = this.jwt.sign(payload, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: '365d',
    });
    return { access_token, token_type: 'Bearer' };
  }

  private async issueUserTokens(user: User, employee?: Employee | null) {
    const linked =
      employee ||
      (user.employee_id ? await this.employees.findOne({ where: { id: user.employee_id } }) : null);
    const payload: JwtUser = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'user',
      employee_id: user.employee_id || undefined,
    };
    const access_token = this.jwt.sign(payload, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: this.config.get<string>('jwt.accessTtl') || '15m',
    });
    const jti = randomUUID();
    const refresh_token = this.jwt.sign(
      { sub: user.id, jti },
      {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: this.config.get<string>('jwt.refreshTtl') || '7d',
      },
    );
    await this.redis.set(`refresh:${jti}`, user.id, 7 * 24 * 3600);
    return {
      access_token,
      refresh_token,
      token_type: 'Bearer',
      expires_in: 900,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        employee_id: user.employee_id || undefined,
        employee_code: linked?.code,
        display_name: linked?.display_name,
      },
    };
  }
}

function uniqueConstraint(err: unknown): 'email' | 'code' | 'other' | null {
  if (!(err instanceof QueryFailedError)) return null;
  const driver = err.driverError as { code?: string; constraint?: string; detail?: string } | undefined;
  if (driver?.code !== '23505') return null;
  const hay = `${driver.constraint || ''} ${driver.detail || ''} ${err.message}`.toLowerCase();
  if (hay.includes('email')) return 'email';
  if (hay.includes('code')) return 'code';
  return 'other';
}
