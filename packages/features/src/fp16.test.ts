import { describe, expect, it } from 'vitest';
import {
  decodeFloat16Array,
  encodeFloat16Array,
  float16BitsToFloat32,
  float32ToFloat16Bits,
} from './fp16';

describe('FP16 feature shard encoding', () => {
  it('encodes known IEEE-754 half-precision bit patterns', () => {
    expect(float32ToFloat16Bits(0)).toBe(0x0000);
    expect(float32ToFloat16Bits(-0)).toBe(0x8000);
    expect(float32ToFloat16Bits(1)).toBe(0x3c00);
    expect(float32ToFloat16Bits(-2)).toBe(0xc000);
    expect(float32ToFloat16Bits(0.5)).toBe(0x3800);
    expect(float32ToFloat16Bits(65_504)).toBe(0x7bff);
    expect(float32ToFloat16Bits(Number.POSITIVE_INFINITY)).toBe(0x7c00);
    expect(float32ToFloat16Bits(Number.NEGATIVE_INFINITY)).toBe(0xfc00);
    expect(float32ToFloat16Bits(Number.NaN)).toBe(0x7e00);
  });

  it('round-trips feature arrays using little-endian FP16 bytes', () => {
    const input = new Float32Array([-1, -0.25, 0, 0.25, 0.5, 1, 3.25, 10]);
    const bytes = encodeFloat16Array(input);
    const view = new DataView(bytes);

    expect(bytes.byteLength).toBe(input.length * 2);
    expect(view.getUint16(0, true)).toBe(float32ToFloat16Bits(-1));
    expect(view.getUint16(2, true)).toBe(float32ToFloat16Bits(-0.25));

    const decoded = decodeFloat16Array(bytes);
    expect(decoded).toHaveLength(input.length);
    for (let index = 0; index < input.length; index += 1) {
      expect(decoded[index]).toBeCloseTo(input[index] ?? 0, 3);
    }
  });

  it('decodes subnormal, infinity, and NaN half values', () => {
    expect(float16BitsToFloat32(0x0001)).toBeGreaterThan(0);
    expect(float16BitsToFloat32(0x7c00)).toBe(Number.POSITIVE_INFINITY);
    expect(float16BitsToFloat32(0xfc00)).toBe(Number.NEGATIVE_INFINITY);
    expect(Number.isNaN(float16BitsToFloat32(0x7e00))).toBe(true);
    expect(() => decodeFloat16Array(new Uint8Array([0]))).toThrow(/divisible by 2/);
  });
});
