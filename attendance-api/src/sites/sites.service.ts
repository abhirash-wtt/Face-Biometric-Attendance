import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Site } from './site.entity';
import { CreateSiteDto } from './dto/create-site.dto';

@Injectable()
export class SitesService {
  constructor(@InjectRepository(Site) private readonly repo: Repository<Site>) {}

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
}
