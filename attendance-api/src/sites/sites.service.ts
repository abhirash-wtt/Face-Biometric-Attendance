import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Site } from './site.entity';
import { CreateSiteDto } from './dto/create-site.dto';
import { isWithinSiteGeofence } from '../common/math';

@Injectable()
export class SitesService {
  constructor(
    @InjectRepository(Site) private readonly repo: Repository<Site>,
    private readonly config: ConfigService,
  ) {}

  create(dto: CreateSiteDto) {
    return this.repo.save(
      this.repo.create({
        ...dto,
        code: dto.code.toUpperCase(),
        radius_m: dto.radius_m ?? 200,
      }),
    );
  }

  findAll() {
    return this.repo.find({ order: { code: 'ASC' } });
  }

  async getByCode(code: string) {
    const site = await this.repo.findOne({ where: { code: code.toUpperCase() } });
    if (!site) throw new NotFoundException('Site not found');
    return site;
  }

  async assertGpsInside(
    siteCode: string | undefined,
    lat?: number,
    lng?: number,
    accuracyM?: number,
  ) {
    if (!this.config.get<boolean>('geofence.enabled')) return;
    if (lat == null || lng == null) {
      throw new UnprocessableEntityException(
        'Location is required. Clock in from inside the office.',
      );
    }
    if (!siteCode) {
      throw new UnprocessableEntityException('site_code is required for geofenced attendance');
    }
    const site = await this.getByCode(siteCode).catch(() => null);
    if (!site) {
      throw new UnprocessableEntityException('Unknown site for geofence check');
    }
    const bufferM = this.config.get<number>('geofence.bufferM') ?? 12;
    const indoorRadiusM = this.config.get<number>('geofence.indoorRadiusM') ?? 40;
    if (!isWithinSiteGeofence(lat, lng, site, bufferM, accuracyM, indoorRadiusM)) {
      throw new UnprocessableEntityException('Outside office geofence');
    }
  }
}
