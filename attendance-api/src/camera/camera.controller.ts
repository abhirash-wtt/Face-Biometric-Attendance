import { Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { CameraBrokerService, isLocalCameraClient } from './camera-broker.service';

@ApiTags('camera')
@Controller()
export class CameraController {
  constructor(private readonly broker: CameraBrokerService) {}

  @Post('camera/release')
  async release(@Req() req: Request, @Res() res: Response) {
    if (process.platform !== 'win32' || !isLocalCameraClient(req.socket.remoteAddress)) {
      res.status(403).type('text/plain').end('The local camera stream is only available on this computer.');
      return;
    }
    try {
      await this.broker.release();
      res.status(204).end();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(503).type('text/plain').end(message || 'Could not take over the camera.');
    }
  }

  @Get('camera/mjpeg')
  stream(@Req() req: Request, @Res() res: Response) {
    if (process.platform !== 'win32' || !isLocalCameraClient(req.socket.remoteAddress)) {
      res.status(403).type('text/plain').end('The local camera stream is only available on this computer.');
      return;
    }
    let opened = false;
    const unsubscribe = this.broker.subscribe(
      (jpeg) => {
        if (res.writableEnded) return;
        if (!opened) {
          opened = true;
          res.writeHead(200, {
            'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
            'Cache-Control': 'no-store, no-transform',
            Connection: 'keep-alive',
          });
        }
        res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`);
        res.write(jpeg);
        res.write('\r\n');
      },
      () => {
        if (res.writableEnded) return;
        if (!opened) res.status(503).type('text/plain').end('Could not take over the camera.');
        else res.end();
      },
    );
    res.on('close', () => unsubscribe());
  }
}
