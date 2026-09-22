import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ChildProcess, execFile, spawn } from 'child_process';
import { networkInterfaces } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import { createFrameBuffer, pushCameraBytes } from './camera-frames';

type Listener = (jpeg: Buffer) => void;
type Client = { listener: Listener; onStop?: () => void };

const execFileAsync = promisify(execFile);

@Injectable()
export class CameraBrokerService implements OnModuleDestroy {
  private readonly logger = new Logger(CameraBrokerService.name);
  private readonly clients = new Set<Client>();
  private child: ChildProcess | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private starting: Promise<void> | null = null;
  private expectedExit = false;
  private releasing: Promise<void> | null = null;

  onModuleDestroy() {
    this.stop();
  }

  release() {
    if (process.platform !== 'win32') return Promise.reject(new Error('The local camera can only be released on Windows.'));
    if (this.releasing) return this.releasing;
    const script = join(process.cwd(), 'scripts', 'take-camera.ps1');
    this.releasing = execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script],
      { windowsHide: true, timeout: 45000 },
    ).then((result) => {
      const line = String(result.stderr || '').trim();
      if (line) this.logger.log(line.split(/\r?\n/).pop());
    }).catch((err) => {
      const detail = String(err?.stderr || err?.message || err).trim();
      const match = detail.match(/fail[^\r\n]*/i);
      throw new Error(match ? match[0] : 'Could not take over the camera.');
    }).finally(() => {
      this.releasing = null;
    });
    return this.releasing;
  }

  subscribe(listener: Listener, onStop?: () => void) {
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    const client = { listener, onStop };
    this.clients.add(client);
    void this.ensureStarted();
    return () => {
      this.clients.delete(client);
      if (this.clients.size > 0) return;
      this.stopTimer = setTimeout(() => {
        if (this.clients.size === 0) this.stop();
      }, 1500);
    };
  }

  private ensureStarted() {
    if (process.platform !== 'win32') return Promise.resolve();
    if (this.child || this.starting) return this.starting ?? Promise.resolve();
    const script = join(process.cwd(), 'scripts', 'camera-broker.ps1');
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-Sta', '-ExecutionPolicy', 'Bypass', '-File', script],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    this.child = child;
    const state = createFrameBuffer();
    child.stdout?.on('data', (chunk: Buffer) => {
      try {
        pushCameraBytes(state, chunk, (jpeg) => {
          for (const client of this.clients) client.listener(jpeg);
        });
      } catch (err) {
        this.logger.warn(err instanceof Error ? err.message : String(err));
        this.stop();
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString().trim();
      if (line) this.logger.log(line);
    });
    child.on('error', (err) => {
      this.logger.warn(err.message);
      this.fail(child);
    });
    child.on('exit', (code) => {
      if (this.expectedExit) {
        this.expectedExit = false;
        if (this.child === child) this.child = null;
        return;
      }
      if (code) this.logger.warn(`Camera capture stopped (${code}).`);
      this.fail(child);
    });
    this.starting = Promise.resolve();
    return this.starting;
  }

  private fail(child: ChildProcess) {
    if (this.child === child) this.child = null;
    this.starting = null;
    for (const client of this.clients) client.onStop?.();
  }

  private stop() {
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.stopTimer = null;
    const child = this.child;
    this.child = null;
    this.starting = null;
    if (!child) return;
    this.expectedExit = true;
    child.kill();
  }
}

export function isLocalCameraClient(remoteAddress: string | undefined) {
  const address = (remoteAddress || '').replace(/^::ffff:/, '');
  if (address === '127.0.0.1' || address === '::1') return true;
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.address === address) return true;
    }
  }
  return false;
}
