const float32Scratch = new Float32Array(1);
const uint32Scratch = new Uint32Array(float32Scratch.buffer);

export function float32ToFloat16Bits(value: number): number {
  float32Scratch[0] = value;
  const bits = uint32Scratch[0] ?? 0;
  const sign = (bits >>> 16) & 0x8000;
  const exponent = (bits >>> 23) & 0xff;
  const mantissa = bits & 0x7fffff;

  if (exponent === 0xff) {
    return sign | (mantissa === 0 ? 0x7c00 : 0x7e00);
  }

  let halfExponent = exponent - 127 + 15;
  if (halfExponent >= 0x1f) {
    return sign | 0x7c00;
  }

  if (halfExponent <= 0) {
    if (halfExponent < -10) {
      return sign;
    }
    const shifted = (mantissa | 0x800000) >> (1 - halfExponent);
    return sign | ((shifted + 0x1000) >> 13);
  }

  let roundedMantissa = mantissa + 0x1000;
  if ((roundedMantissa & 0x800000) !== 0) {
    roundedMantissa = 0;
    halfExponent += 1;
    if (halfExponent >= 0x1f) {
      return sign | 0x7c00;
    }
  }

  return sign | (halfExponent << 10) | (roundedMantissa >> 13);
}

export function float16BitsToFloat32(bits: number): number {
  const half = bits & 0xffff;
  const sign = (half & 0x8000) << 16;
  const exponent = (half >>> 10) & 0x1f;
  const mantissa = half & 0x03ff;

  if (exponent === 0) {
    if (mantissa === 0) {
      uint32Scratch[0] = sign;
      return float32Scratch[0] ?? 0;
    }
    const value = (mantissa / 0x400) * 2 ** -14;
    return sign === 0 ? value : -value;
  }

  if (exponent === 0x1f) {
    uint32Scratch[0] = sign | 0x7f800000 | (mantissa === 0 ? 0 : 0x400000);
    return float32Scratch[0] ?? Number.NaN;
  }

  uint32Scratch[0] = sign | ((exponent - 15 + 127) << 23) | (mantissa << 13);
  return float32Scratch[0] ?? 0;
}

export function encodeFloat16Array(values: Float32Array | readonly number[]): ArrayBuffer {
  const buffer = new ArrayBuffer(values.length * 2);
  const view = new DataView(buffer);
  for (let index = 0; index < values.length; index += 1) {
    view.setUint16(index * 2, float32ToFloat16Bits(Number(values[index] ?? 0)), true);
  }
  return buffer;
}

export function decodeFloat16Array(bytes: ArrayBuffer | ArrayBufferView): Float32Array {
  const buffer =
    bytes instanceof ArrayBuffer
      ? bytes
      : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  if (buffer.byteLength % 2 !== 0) {
    throw new Error('FP16 byte length must be divisible by 2.');
  }
  const view = new DataView(buffer);
  const output = new Float32Array(buffer.byteLength / 2);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = float16BitsToFloat32(view.getUint16(index * 2, true));
  }
  return output;
}
