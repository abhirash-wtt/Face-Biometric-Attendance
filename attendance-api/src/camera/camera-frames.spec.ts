import { createFrameBuffer, pushCameraBytes } from './camera-frames';

describe('pushCameraBytes', () => {
  it('reassembles a JPEG split across chunks', () => {
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(120, 7), Buffer.from([0xff, 0xd9])]);
    const header = Buffer.alloc(4);
    header.writeUInt32LE(jpeg.length, 0);
    const payload = Buffer.concat([header, jpeg]);
    const state = createFrameBuffer();
    const frames: Buffer[] = [];
    pushCameraBytes(state, payload.subarray(0, 10), (frame) => frames.push(frame));
    pushCameraBytes(state, payload.subarray(10), (frame) => frames.push(frame));
    expect(frames).toHaveLength(1);
    expect(frames[0].equals(jpeg)).toBe(true);
  });
});
