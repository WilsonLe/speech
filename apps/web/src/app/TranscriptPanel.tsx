import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MicrophoneCaptureController,
  attachPcmCaptureWorklet,
  getDefaultMicrophoneProcessingOptions,
  type PcmCaptureWorkletController,
  type PcmCaptureWorkletMessage,
} from '@speech/audio';
import { MenuButton, type MenuButtonItem } from '@speech/ui';
import pcmCaptureWorkletUrl from '../worklets/pcm-capture.worklet.ts?worker&url';
import {
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
  type TranscriptWorkspaceState,
} from './transcript-state';

import type { LanguageModeDiagnostics, SpeechLanguageMode } from '@speech/protocol';

const pushToTalkKeyLabel = 'Space';

interface TranscriptSettingsState {
  readonly languageMode: SpeechLanguageMode;
  readonly formattingEnabled: boolean;
  readonly spokenCommandsEnabled: boolean;
  readonly includeTimingMetadataInDownload: boolean;
}

const languageModeLabels: Record<SpeechLanguageMode, string> = {
  vi: 'Tiếng Việt',
  en: 'English',
  auto: 'Auto',
  mixed: 'Mixed',
};

const defaultTranscriptSettings: TranscriptSettingsState = {
  languageMode: 'auto',
  formattingEnabled: true,
  spokenCommandsEnabled: false,
  includeTimingMetadataInDownload: false,
};

export function TranscriptPanel() {
  const microphoneController = useMemo(() => new MicrophoneCaptureController(), []);
  const workletController = useRef<PcmCaptureWorkletController | null>(null);
  const workspaceRef = useRef<TranscriptWorkspaceState>(initialTranscriptWorkspaceState);
  const stopRequestedRef = useRef(false);
  const stoppingRef = useRef(false);
  const [workspace, setWorkspace] = useState<TranscriptWorkspaceState>(
    initialTranscriptWorkspaceState,
  );
  const [settings, setSettings] = useState<TranscriptSettingsState>(defaultTranscriptSettings);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const updateWorkspace = useCallback(
    (updater: (current: TranscriptWorkspaceState) => TranscriptWorkspaceState) => {
      const next = updater(workspaceRef.current);
      workspaceRef.current = next;
      setWorkspace(next);
    },
    [],
  );

  const stopPushToTalk = useCallback(async () => {
    stopRequestedRef.current = true;
    const status = workspaceRef.current.status;
    if (status === 'idle' || status === 'error' || status === 'stopping' || stoppingRef.current) {
      return;
    }
    if (status === 'requesting') {
      updateWorkspace(markTranscriptStopping);
      return;
    }

    stoppingRef.current = true;
    const releasedAtMs = performance.now();
    updateWorkspace(markTranscriptStopping);
    try {
      workletController.current?.stop();
      workletController.current?.dispose();
      workletController.current = null;
      await microphoneController.stop();
      updateWorkspace((current) =>
        finishTranscriptUtterance(current, { releasedAtMs, endedAtMs: performance.now() }),
      );
    } finally {
      stoppingRef.current = false;
      stopRequestedRef.current = false;
    }
  }, [microphoneController, updateWorkspace]);

  const handleWorkletMessage = useCallback(
    (message: PcmCaptureWorkletMessage) => {
      switch (message.type) {
        case 'CAPTURE_STARTED':
        case 'CAPTURE_STOPPED':
        case 'LEVEL':
        case 'RING_BUFFER_STATUS':
          return;
        case 'PCM_CHUNK':
          updateWorkspace((current) =>
            recordTranscriptAudioChunk(current, {
              sampleCount: message.sampleCount,
              sampleRateHz: message.sampleRateHz,
            }),
          );
          workletController.current?.releaseTransferredBuffer(message);
          return;
        case 'CAPTURE_ERROR':
          updateWorkspace((current) => failTranscriptCapture(current, message.message));
          return;
      }
    },
    [updateWorkspace],
  );

  const startPushToTalk = useCallback(async () => {
    const currentStatus = workspaceRef.current.status;
    if (
      currentStatus === 'requesting' ||
      currentStatus === 'listening' ||
      currentStatus === 'stopping'
    ) {
      return;
    }

    const utteranceId = `utt-${Date.now().toString(36)}`;
    stopRequestedRef.current = false;
    updateWorkspace(startTranscriptRequest);

    try {
      const session = await microphoneController.start({
        processing: getDefaultMicrophoneProcessingOptions(),
      });
      const captureWorklet = await attachPcmCaptureWorklet({
        audioContext: session.audioContext,
        sourceNode: session.sourceNode,
        workletModuleUrl: pcmCaptureWorkletUrl,
        onMessage: handleWorkletMessage,
      });
      workletController.current = captureWorklet;
      captureWorklet.start();
      updateWorkspace((current) =>
        startTranscriptUtterance(current, {
          utteranceId,
          startedAtMs: performance.now(),
        }),
      );

      if (stopRequestedRef.current) {
        await stopPushToTalk();
      }
    } catch (error) {
      workletController.current?.dispose();
      workletController.current = null;
      await microphoneController.stop();
      updateWorkspace((current) =>
        failTranscriptCapture(
          current,
          error instanceof Error ? error.message : 'Push-to-talk microphone capture failed.',
        ),
      );
      stopRequestedRef.current = false;
      stoppingRef.current = false;
    }
  }, [handleWorkletMessage, microphoneController, stopPushToTalk, updateWorkspace]);

  useEffect(() => {
    return () => {
      workletController.current?.dispose();
      workletController.current = null;
      void microphoneController.stop();
    };
  }, [microphoneController]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isPushToTalkKey(event) || isEditableTarget(event.target)) {
        return;
      }
      event.preventDefault();
      if (!event.repeat) {
        void startPushToTalk();
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (!isPushToTalkKey(event) || isEditableTarget(event.target)) {
        return;
      }
      event.preventDefault();
      void stopPushToTalk();
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [startPushToTalk, stopPushToTalk]);

  const transcriptText = getTranscriptPlainText(workspace);
  const hasTranscriptText = transcriptText.length > 0;
  const isPressing = workspace.status === 'requesting' || workspace.status === 'listening';
  const displayProvisional = workspace.provisional || (isPressing ? ' Listening…' : '');
  const canClear = hasTranscriptText && workspace.status === 'idle';

  async function copyTranscript() {
    if (!hasTranscriptText) return;
    try {
      await navigator.clipboard.writeText(transcriptText);
      setCopyStatus('Copied.');
    } catch (error) {
      setCopyStatus(error instanceof Error ? error.message : 'Clipboard copy failed.');
    }
  }

  function downloadTranscript() {
    if (!hasTranscriptText) return;
    const blob = new Blob(
      [
        buildTranscriptDownloadText(workspace, {
          includeTimingMetadata: settings.includeTimingMetadataInDownload,
          generatedAtIso: new Date().toISOString(),
          languageModeLabel: languageModeLabels[settings.languageMode],
          formattingEnabled: settings.formattingEnabled,
          spokenCommandsEnabled: settings.spokenCommandsEnabled,
        }),
      ],
      { type: 'text/plain;charset=utf-8' },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `speech-transcript-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    anchor.rel = 'noopener';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function clearCommittedTranscript(actionLabel: 'New transcript' | 'Clear transcript') {
    if (!canClear) return;
    if (
      !window.confirm(`${actionLabel}? This removes the current transcript text from this page.`)
    ) {
      return;
    }
    updateWorkspace(clearTranscript);
    setCopyStatus(null);
  }

  const transcriptActionItems: readonly MenuButtonItem[] = hasTranscriptText
    ? [
        {
          id: 'new-transcript',
          label: 'New transcript',
          disabled: !canClear,
          onSelect: () => clearCommittedTranscript('New transcript'),
        },
        { id: 'download-transcript', label: 'Download text…', onSelect: downloadTranscript },
        {
          id: 'clear-transcript',
          label: 'Clear transcript',
          destructive: true,
          disabled: !canClear,
          onSelect: () => clearCommittedTranscript('Clear transcript'),
        },
      ]
    : [];

  return (
    <section
      className="panel transcript dictate-workspace"
      id="dictate"
      aria-labelledby="transcript-title"
    >
      <div className="dictate-toolbar" aria-label="Dictate context controls">
        <label className="dictate-toolbar__field" htmlFor="language-mode-select">
          <span>Language</span>
          <select
            id="language-mode-select"
            value={settings.languageMode}
            onChange={(event) => {
              const value = event.currentTarget.value as SpeechLanguageMode;
              setSettings((current) => ({ ...current, languageMode: value }));
              updateWorkspace((current) => setTranscriptLanguageMode(current, value));
            }}
          >
            <option value="auto">Auto</option>
            <option value="vi">Tiếng Việt</option>
            <option value="en">English</option>
            <option value="mixed">Mixed</option>
          </select>
        </label>
        <a className="dictate-toolbar__link" href="/models">
          <span>Model</span>
          <strong>Generic</strong>
        </a>
        <a className="dictate-toolbar__link" href="/vocabulary">
          <span>Vocabulary</span>
          <strong>Manage</strong>
        </a>
        {hasTranscriptText ? (
          <button
            type="button"
            className="secondary dictate-copy"
            onClick={() => void copyTranscript()}
          >
            Copy
          </button>
        ) : null}
        {transcriptActionItems.length > 0 ? (
          <MenuButton
            buttonSize="sm"
            className="dictate-actions-menu"
            items={transcriptActionItems}
            label="Transcript actions"
            menuLabel="Transcript actions"
            placement="bottom-end"
          />
        ) : null}
      </div>

      <div className="dictate-stage">
        <div className="dictate-stage__heading">
          <h2 id="transcript-title">Dictate</h2>
          <p className="sr-only" id="dictate-shortcut-help">
            Press and hold Space outside form controls to record. Release to stop recording.
          </p>
        </div>

        <div className="transcript-display dictate-transcript-area">
          <label className="sr-only" htmlFor="committed-transcript-text">
            Transcript
          </label>
          <textarea
            id="committed-transcript-text"
            className="transcript-editor"
            value={workspace.committed}
            placeholder="Hold to speak"
            aria-describedby="dictate-shortcut-help"
            onChange={(event) => {
              const { value } = event.currentTarget;
              updateWorkspace((current) => editTranscriptCommittedText(current, value));
              setCopyStatus(null);
            }}
            spellCheck="true"
          />
          {displayProvisional.length > 0 ? (
            <p
              className="transcript-provisional"
              aria-label="Provisional transcript suffix"
              aria-live="polite"
            >
              {displayProvisional}
            </p>
          ) : null}
        </div>

        <div className="dictate-recording-bar" aria-label="Recording control">
          <button
            type="button"
            className="push-to-talk-button"
            aria-label={isPressing ? 'Release to stop recording' : 'Hold to speak'}
            aria-pressed={isPressing}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              void startPushToTalk();
            }}
            onPointerUp={(event) => {
              event.preventDefault();
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              void stopPushToTalk();
            }}
            onPointerCancel={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              void stopPushToTalk();
            }}
            disabled={workspace.status === 'stopping'}
          >
            {isPressing ? 'Stop' : 'Hold to speak'}
          </button>
          {workspace.status !== 'idle' ? (
            <span
              className="dictate-state"
              data-tone={statusTone(workspace.status)}
              aria-live="polite"
            >
              {formatCaptureStatus(workspace.status)}
            </span>
          ) : null}
        </div>
      </div>

      {workspace.errorMessage ? (
        <p role="alert" className="status-message error-message">
          {workspace.errorMessage} Check microphone permission and try again.
        </p>
      ) : null}

      {workspace.status !== 'idle' && !workspace.errorMessage ? (
        <p className="status-message" aria-live="polite">
          {workspace.statusMessage}
        </p>
      ) : null}
      {copyStatus ? (
        <p className="status-message" aria-live="polite">
          {copyStatus}
        </p>
      ) : null}

      <details className="dictate-details">
        <summary>Dictation details</summary>
        <div
          className="transcript-settings-privacy"
          aria-label="Transcript settings, language diagnostics, and privacy"
        >
          <fieldset className="transcript-settings-card">
            <legend>Transcript options</legend>
            <label>
              <input
                type="checkbox"
                checked={settings.formattingEnabled}
                onChange={(event) => {
                  const { checked } = event.currentTarget;
                  setSettings((current) => ({ ...current, formattingEnabled: checked }));
                }}
              />
              Enable final formatting when available
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings.spokenCommandsEnabled}
                onChange={(event) => {
                  const { checked } = event.currentTarget;
                  setSettings((current) => ({ ...current, spokenCommandsEnabled: checked }));
                }}
              />
              Enable spoken commands
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings.includeTimingMetadataInDownload}
                onChange={(event) => {
                  const { checked } = event.currentTarget;
                  setSettings((current) => ({
                    ...current,
                    includeTimingMetadataInDownload: checked,
                  }));
                }}
              />
              Include timing in downloaded text
            </label>
          </fieldset>

          <article
            className="transcript-language-card"
            aria-labelledby="transcript-language-diagnostics-title"
          >
            <h3 id="transcript-language-diagnostics-title">Language details</h3>
            <dl aria-label="Language-span diagnostics">
              <div>
                <dt>Requested</dt>
                <dd>{languageModeLabels[workspace.languageDiagnostics.requestedMode]}</dd>
              </div>
              <div>
                <dt>Effective</dt>
                <dd>{languageModeLabels[workspace.languageDiagnostics.effectiveMode]}</dd>
              </div>
              <div>
                <dt>Spans</dt>
                <dd>{formatLanguageSpanSummary(workspace.languageDiagnostics)}</dd>
              </div>
            </dl>
            <p>
              {workspace.languageDiagnostics.fallbackReason ??
                'Local language-span details appear after ASR output arrives.'}
            </p>
          </article>

          <article className="transcript-privacy-card" aria-labelledby="transcript-privacy-title">
            <h3 id="transcript-privacy-title">Privacy and export</h3>
            <ul>
              <li>Copy uses the browser Clipboard API.</li>
              <li>Download saves committed transcript text locally.</li>
              <li>Provisional words are excluded from copy and download.</li>
            </ul>
          </article>
        </div>

        <dl className="transcript-footer" aria-label="Transcript latency and capture status">
          <div>
            <dt>Shortcut</dt>
            <dd>{pushToTalkKeyLabel}</dd>
          </div>
          <div>
            <dt>Chunks</dt>
            <dd>{workspace.timings.capturedChunks}</dd>
          </div>
          <div>
            <dt>Samples</dt>
            <dd>{workspace.timings.capturedSamples}</dd>
          </div>
          <div>
            <dt>Sample rate</dt>
            <dd>
              {workspace.timings.sampleRateHz ? `${workspace.timings.sampleRateHz} Hz` : 'pending'}
            </dd>
          </div>
          <div>
            <dt>First partial</dt>
            <dd>{formatLatency(workspace.timings.firstPartialLatencyMs)}</dd>
          </div>
          <div>
            <dt>Finalization</dt>
            <dd>{formatLatency(workspace.timings.finalizationLatencyMs)}</dd>
          </div>
        </dl>
      </details>
    </section>
  );
}

function formatCaptureStatus(status: TranscriptWorkspaceState['status']): string {
  switch (status) {
    case 'idle':
      return 'Ready';
    case 'requesting':
      return 'Requesting';
    case 'listening':
      return 'Listening';
    case 'stopping':
      return 'Finalizing';
    case 'error':
      return 'Needs attention';
  }
}

function statusTone(
  status: TranscriptWorkspaceState['status'],
): 'neutral' | 'good' | 'warn' | 'error' {
  switch (status) {
    case 'idle':
      return 'neutral';
    case 'listening':
      return 'good';
    case 'requesting':
    case 'stopping':
      return 'warn';
    case 'error':
      return 'error';
  }
}

function formatLanguageSpanSummary(diagnostics: LanguageModeDiagnostics): string {
  const { spanSummary } = diagnostics;
  if (spanSummary.spanCount === 0) return 'No spans yet';
  return `${spanSummary.spanCount.toString()} spans · ${spanSummary.switchCount.toString()} switches · vi ${spanSummary.tokenCounts.vi.toString()} / en ${spanSummary.tokenCounts.en.toString()} / mixed ${spanSummary.tokenCounts.mixed.toString()}`;
}

function formatLatency(value: number | null): string {
  return value === null ? 'pending' : `${Math.round(value).toString()} ms`;
}

function isPushToTalkKey(event: KeyboardEvent): boolean {
  return event.code === 'Space' || event.key === ' ';
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return target.closest('input, textarea, select, [contenteditable="true"]') !== null;
}
