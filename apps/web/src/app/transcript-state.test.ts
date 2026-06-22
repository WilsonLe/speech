import { describe, expect, it } from 'vitest';
import {
  applyTranscriptPartial,
  clearTranscript,
  failTranscriptCapture,
  finishTranscriptUtterance,
  getTranscriptPlainText,
  initialTranscriptWorkspaceState,
  markTranscriptStopping,
  recordTranscriptAudioChunk,
  startTranscriptRequest,
  startTranscriptUtterance,
} from './transcript-state';

describe('transcript workspace state', () => {
  it('tracks request, listening, partial, audio, and final states', () => {
    const requesting = startTranscriptRequest(initialTranscriptWorkspaceState);
    expect(requesting.status).toBe('requesting');
    expect(requesting.provisional).toBe('');

    const listening = startTranscriptUtterance(requesting, {
      utteranceId: 'utt-1',
      startedAtMs: 1_000,
    });
    expect(listening.status).toBe('listening');
    expect(listening.timings.utteranceStartedAtMs).toBe(1_000);

    const withAudio = recordTranscriptAudioChunk(listening, {
      sampleCount: 1_280,
      sampleRateHz: 48_000,
    });
    expect(withAudio.timings.capturedChunks).toBe(1);
    expect(withAudio.timings.capturedSamples).toBe(1_280);
    expect(withAudio.timings.sampleRateHz).toBe(48_000);

    const partial = applyTranscriptPartial(withAudio, {
      committed: 'xin chào',
      provisional: ' việt nam',
      emittedAtMs: 1_180,
    });
    expect(partial.committed).toBe('xin chào');
    expect(partial.provisional).toBe(' việt nam');
    expect(partial.timings.firstPartialLatencyMs).toBe(180);

    const final = finishTranscriptUtterance(partial, {
      text: 'xin chào việt nam',
      releasedAtMs: 1_320,
      endedAtMs: 1_360,
    });
    expect(final.status).toBe('idle');
    expect(final.committed).toBe('xin chào việt nam');
    expect(final.provisional).toBe('');
    expect(final.timings.finalizationLatencyMs).toBe(40);
  });

  it('keeps only actual transcript text local for copy/download actions', () => {
    const state = {
      ...initialTranscriptWorkspaceState,
      committed: 'local first',
      provisional: ' speech',
    };

    expect(getTranscriptPlainText(state)).toBe('local first speech');
    expect(getTranscriptPlainText(startTranscriptRequest(initialTranscriptWorkspaceState))).toBe(
      '',
    );
  });

  it('clears text while preserving an active capture session', () => {
    const listening = startTranscriptUtterance(
      startTranscriptRequest(initialTranscriptWorkspaceState),
      {
        utteranceId: 'utt-2',
        startedAtMs: 2_000,
      },
    );
    const state = { ...listening, committed: 'draft', provisional: ' suffix' };

    const cleared = clearTranscript(state);
    expect(cleared.status).toBe('listening');
    expect(cleared.utteranceId).toBe('utt-2');
    expect(cleared.committed).toBe('');
    expect(cleared.provisional).toBe('');
  });

  it('marks stopping and errors with actionable status text', () => {
    const listening = startTranscriptUtterance(
      startTranscriptRequest(initialTranscriptWorkspaceState),
      {
        utteranceId: 'utt-3',
        startedAtMs: 3_000,
      },
    );

    expect(markTranscriptStopping(listening).status).toBe('stopping');
    const failed = failTranscriptCapture(listening, 'Microphone permission denied.');
    expect(failed.status).toBe('error');
    expect(failed.errorMessage).toBe('Microphone permission denied.');
    expect(failed.statusMessage).toContain('try again');
  });
});
