import { Controller, ForbiddenException, Get, NotFoundException, Param, Query, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Response } from 'express';
import { StorageService } from './storage.service';

@ApiExcludeController()
@Controller('evidence')
export class EvidenceController {
  constructor(private readonly storage: StorageService) {}

  @Get('*')
  async get(
    @Param() params: Record<string, string>,
    @Query('exp') exp: unknown,
    @Query('sig') sig: unknown,
    @Res() res: Response,
  ) {
    const key = Object.values(params)[0] || '';
    if (!this.storage.verifySignedKey(key, exp, sig)) {
      throw new ForbiddenException('This image link is invalid or has expired');
    }
    const buf = await this.storage.get(`/evidence/${key}`);
    if (!buf) throw new NotFoundException();
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(buf);
  }
}
