import { describe, expect, it } from 'vitest';
import {
  applyTranscriptPartial,
  buildTranscriptDownloadText,
  clearTranscript,
  editTranscriptCommittedText,
  failTranscriptCapture,
  finishTranscriptUtterance,
  getTranscriptPlainText,
  initialTranscriptWorkspaceState,
  markTranscriptStopping,
  recordTranscriptAudioChunk,
  setTranscriptLanguageMode,
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
      languageSpans: [
        { startToken: 0, endToken: 2, language: 'vi' },
        { startToken: 2, endToken: 4, language: 'en' },
      ],
    });
    expect(partial.committed).toBe('xin chào');
    expect(partial.provisional).toBe(' việt nam');
    expect(partial.timings.firstPartialLatencyMs).toBe(180);
    expect(partial.languageDiagnostics.spanSummary).toMatchObject({
      spanCount: 2,
      switchCount: 1,
      tokenCounts: { vi: 2, en: 2, mixed: 0 },
    });

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

  it('keeps only committed transcript text local for copy/download actions', () => {
    const state = {
      ...initialTranscriptWorkspaceState,
      committed: 'local first',
      provisional: ' speech',
    };

    expect(getTranscriptPlainText(state)).toBe('local first');
    expect(getTranscriptPlainText(startTranscriptRequest(initialTranscriptWorkspaceState))).toBe(
      '',
    );
  });

  it('edits committed text without touching active provisional state', () => {
    const state = {
      ...initialTranscriptWorkspaceState,
      status: 'listening' as const,
      committed: 'draft',
      provisional: ' suffix',
    };

    const edited = editTranscriptCommittedText(state, 'edited transcript');
    expect(edited.status).toBe('listening');
    expect(edited.committed).toBe('edited transcript');
    expect(edited.provisional).toBe(' suffix');
  });

  it('builds a plain-text download with optional local timing metadata', () => {
    const state = {
      ...initialTranscriptWorkspaceState,
      committed: 'xin chào',
      timings: {
        ...initialTranscriptWorkspaceState.timings,
        capturedChunks: 2,
        capturedSamples: 2560,
        sampleRateHz: 48000,
        finalizationLatencyMs: 42,
      },
    };

    expect(
      buildTranscriptDownloadText(state, {
        includeTimingMetadata: false,
        generatedAtIso: '2026-06-22T00:00:00.000Z',
        languageModeLabel: 'Auto/code-switch',
        formattingEnabled: true,
        spokenCommandsEnabled: false,
      }),
    ).toBe('xin chào\n');

    const withMetadata = buildTranscriptDownloadText(state, {
      includeTimingMetadata: true,
      generatedAtIso: '2026-06-22T00:00:00.000Z',
      languageModeLabel: 'Auto/code-switch',
      formattingEnabled: true,
      spokenCommandsEnabled: false,
    });
    expect(withMetadata).toContain('Language mode: Auto/code-switch');
    expect(withMetadata).toContain('Effective language mode: auto');
    expect(withMetadata).toContain('Language spans: none');
    expect(withMetadata).toContain('Captured chunks: 2');
    expect(withMetadata).toContain('Finalization latency: 42 ms');
  });

  it('updates language mode diagnostics without touching transcript text', () => {
    const state = {
      ...initialTranscriptWorkspaceState,
      committed: 'draft',
    };

    const mixed = setTranscriptLanguageMode(state, 'mixed');
    expect(mixed.committed).toBe('draft');
    expect(mixed.languageDiagnostics.requestedMode).toBe('mixed');
    expect(mixed.languageDiagnostics.effectiveMode).toBe('mixed');
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
