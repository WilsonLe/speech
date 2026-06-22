import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition } from './runtime-state';

describe('runtime state transitions', () => {
  it('allows the boot-to-ready model loading path', () => {
    expect(canTransition('BOOTING', 'CHECKING_CAPABILITIES')).toBe(true);
    expect(canTransition('CHECKING_CAPABILITIES', 'LOADING_MODEL')).toBe(true);
    expect(canTransition('LOADING_MODEL', 'READY')).toBe(true);
  });

  it('rejects illegal jumps into listening', () => {
    expect(canTransition('BOOTING', 'LISTENING')).toBe(false);
    expect(() => assertTransition('BOOTING', 'LISTENING')).toThrow(/Illegal runtime transition/);
  });
});
