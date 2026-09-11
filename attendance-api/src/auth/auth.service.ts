import { Injectable, OnModuleInit, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { User } from './user.entity';
import { RedisService } from '../redis/redis.service';
import { JwtUser } from './jwt.strategy';
import { DatabaseInitService } from '../database/database-init.service';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly dbInit: DatabaseInitService,
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
  }

  async login(email: string, password: string) {
    const user = await this.users.findOne({ where: { email: email.toLowerCase() } });
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueUserTokens(user);
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

  private async issueUserTokens(user: User) {
    const payload: JwtUser = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'user',
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
      user: { id: user.id, email: user.email, role: user.role },
    };
  }
}
