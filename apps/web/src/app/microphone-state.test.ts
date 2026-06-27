import { describe, expect, it } from 'vitest';
import { createMicrophoneBlockerView, formatMicrophoneBlockerText } from './microphone-state';

describe('microphone state copy', () => {
  it('maps permission failures to one concise actionable blocker', () => {
    const blocker = createMicrophoneBlockerView({
      code: 'MIC_PERMISSION_DENIED',
      message: 'Microphone permission was denied.',
      recoveryStep: 'Raw recovery step from capture package.',
    });

    expect(blocker).toEqual({
      headline: 'Microphone blocked',
      message: 'Allow microphone access for this site, then try recording again.',
      action: 'Open the browser permission prompt or site settings.',
    });
    expect(JSON.stringify(blocker)).not.toMatch(
      /raw recovery|audio(worklet|context)|getUserMedia/i,
    );
  });

  it('maps missing-device failures without exposing browser exception names', () => {
    const blocker = createMicrophoneBlockerView('NotFoundError: requested device is unavailable');

    expect(blocker.headline).toBe('No microphone found');
    expect(blocker.message).toBe('Connect or choose a microphone, then try again.');
    expect(formatMicrophoneBlockerText('DevicesNotFoundError')).not.toMatch(
      /NotFound|DOMException/,
    );
  });

  it('maps busy device and generic worker failures to refresh/retry guidance', () => {
    expect(createMicrophoneBlockerView('NotReadableError: audio device is busy').headline).toBe(
      'Recording interrupted',
    );

    const blocker = createMicrophoneBlockerView({
      code: 'AUDIO_CONTEXT_FAILED',
      message: 'AudioWorklet processor failed to initialize at internal path /private/tmp/file.js',
    });

    expect(blocker).toEqual({
      headline: 'Recording interrupted',
      message: 'Stop any other app using the microphone, then try again.',
      action: 'Refresh the app if recording still cannot start.',
    });
    expect(formatMicrophoneBlockerText(blocker)).not.toMatch(/AudioWorklet|internal path|private/);
  });
});
