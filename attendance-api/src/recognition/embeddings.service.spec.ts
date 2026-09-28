import { ConfigService } from '@nestjs/config';
import { EmbeddingsService } from './embeddings.service';

function serviceWith(settings: Record<string, unknown>) {
  const config = { get: (key: string) => settings[key] } as unknown as ConfigService;
  return new EmbeddingsService(config);
}

describe('EmbeddingsService model requirement', () => {
  const missing = {
    'recognition.onnxModelPath': './models/does-not-exist.onnx',
    'recognition.provider': 'internal',
  };

  it('refuses to start without the model when it is required', async () => {
    const service = serviceWith({ ...missing, 'recognition.requireModel': true });
    await expect(service.onModuleInit()).rejects.toThrow(/ONNX model not found/);
  });

  it('falls back to prototype embeddings when the model is optional', async () => {
    const service = serviceWith({ ...missing, 'recognition.requireModel': false });
    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(service.isModelActive()).toBe(false);
  });

  it('does not require the model when CompreFace handles recognition', async () => {
    const service = serviceWith({
      ...missing,
      'recognition.provider': 'compreface',
      'recognition.requireModel': true,
    });
    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });
});
