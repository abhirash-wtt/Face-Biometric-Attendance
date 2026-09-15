import {
  ConflictException,
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
import { effectiveRole } from '../common/guards/roles.guard';

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
          role: 'user',
        }),
      );
      this.logger.log(`Seeded regular user ${userEmail}`);
    }
  }

  async register(email: string, password: string, displayName: string) {
    const normalized = email.trim().toLowerCase();
    const name = displayName.trim();
    const existing = await this.users.findOne({ where: { email: normalized } });
    if (existing) throw new ConflictException('Email already registered');

    const password_hash = await bcrypt.hash(password, 10);
    let lastError: unknown;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const saved = await this.ds.transaction(async (manager) => {
          const codes = (await manager.find(Employee, { select: ['code'] })).map((e) => e.code);
          const employee = await manager.save(
            Employee,
            manager.create(Employee, {
              code: nextEmployeeCode(codes),
              display_name: name,
              status: 'active',
            }),
          );
          const user = await manager.save(
            User,
            manager.create(User, {
              email: normalized,
              password_hash,
              role: 'user',
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
      role: effectiveRole(user.role),
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
