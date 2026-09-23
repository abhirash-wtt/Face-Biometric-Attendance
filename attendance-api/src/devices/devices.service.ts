import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Device } from './device.entity';
import { SitesService } from '../sites/sites.service';
import { AuthService } from '../auth/auth.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { JwtUser } from '../auth/jwt.strategy';
import { isAdminLike } from '../common/guards/roles.guard';

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(Device) private readonly repo: Repository<Device>,
    private readonly sites: SitesService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDeviceDto, user?: JwtUser) {
    const isAdmin = isAdminLike(user?.role);
    if (user?.type === 'user' && !isAdmin) {
      throw new ForbiddenException('Only admins can register devices');
    }
    const secret = this.config.get<string>('deviceBootstrapSecret');
    if (!isAdmin && dto.bootstrap_secret !== secret) {
      throw new ForbiddenException('Invalid device bind secret');
    }
    let site_id: string | undefined;
    let site_code = dto.site_code?.toUpperCase();
    if (site_code) {
      const site = await this.sites.getByCode(site_code);
      site_id = site.id;
      site_code = site.code;
    }
    let device = await this.repo.findOne({ where: { device_id: dto.device_id } });
    if (!device) {
      device = this.repo.create({
        device_id: dto.device_id,
        site_id,
        description: dto.description,
        active: true,
      });
    } else {
      device.site_id = site_id ?? device.site_id;
      device.description = dto.description ?? device.description;
      device.active = true;
    }
    device = await this.repo.save(device);
    const tokens = this.auth.issueDeviceToken(device.device_id, site_code);
    return { device, ...tokens };
  }

  findAll() {
    return this.repo.find({ relations: ['site'], order: { device_id: 'ASC' } });
  }
}
