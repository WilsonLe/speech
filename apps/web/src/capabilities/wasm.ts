const wasmSimdProbe = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b, 0x03,
  0x02, 0x01, 0x00, 0x0a, 0x0a, 0x01, 0x08, 0x00, 0x41, 0x00, 0xfd, 0x0f, 0xfd, 0x62, 0x0b,
]);

export async function detectWebAssemblySimd(): Promise<boolean> {
  if (typeof WebAssembly === 'undefined' || typeof WebAssembly.validate !== 'function') {
    return false;
  }

  return WebAssembly.validate(wasmSimdProbe);
}

export async function detectWebAssemblyThreads(): Promise<boolean> {
  if (typeof WebAssembly === 'undefined' || typeof SharedArrayBuffer === 'undefined') {
    return false;
  }

  try {
    new WebAssembly.Memory({ initial: 1, maximum: 1, shared: true });
    return true;
  } catch {
    return false;
  }
}
