export type FrameBuffer = { buffer: Buffer };

const MIN_JPEG = 100;
const MAX_JPEG = 8_000_000;

export function createFrameBuffer(): FrameBuffer {
  return { buffer: Buffer.alloc(0) };
}

/** Reads uint32-le length-prefixed JPEG frames from a byte stream. */
export function pushCameraBytes(state: FrameBuffer, chunk: Buffer, onFrame: (jpeg: Buffer) => void) {
  state.buffer = state.buffer.length === 0 ? chunk : Buffer.concat([state.buffer, chunk]);
  while (state.buffer.length >= 4) {
    const length = state.buffer.readUInt32LE(0);
    if (length < MIN_JPEG || length > MAX_JPEG) {
      state.buffer = Buffer.alloc(0);
      throw new Error('Camera frame stream lost synchronization.');
    }
    if (state.buffer.length < 4 + length) return;
    onFrame(Buffer.from(state.buffer.subarray(4, 4 + length)));
    state.buffer = state.buffer.subarray(4 + length);
  }
}
