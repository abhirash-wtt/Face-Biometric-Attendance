import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Response } from 'express';
import { StorageService } from './storage.service';

@ApiExcludeController()
@Controller('evidence')
export class EvidenceController {
  constructor(private readonly storage: StorageService) {}

  @Get('*')
  async get(@Param() params: Record<string, string>, @Res() res: Response) {
    const key = Object.values(params)[0];
    const buf = await this.storage.get(`/evidence/${key}`);
    if (!buf) throw new NotFoundException();
    res.setHeader('Content-Type', 'image/jpeg');
    res.send(buf);
  }
}
