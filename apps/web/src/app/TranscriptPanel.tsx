import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MicrophoneCaptureController,
  attachPcmCaptureWorklet,
  getDefaultMicrophoneProcessingOptions,
  type PcmCaptureWorkletController,
  type PcmCaptureWorkletMessage,
} from '@speech/audio';
import pcmCaptureWorkletUrl from '../worklets/pcm-capture.worklet.ts?worker&url';
import {
  clearTranscript,
  failTranscriptCapture,
  finishTranscriptUtterance,
  getTranscriptPlainText,
  initialTranscriptWorkspaceState,
  markTranscriptStopping,
  recordTranscriptAudioChunk,
  startTranscriptRequest,
  startTranscriptUtterance,
  type TranscriptWorkspaceState,
} from './transcript-state';

const pushToTalkKeyLabel = 'Space';

export function TranscriptPanel() {
  const microphoneController = useMemo(() => new MicrophoneCaptureController(), []);
  const workletController = useRef<PcmCaptureWorkletController | null>(null);
  const workspaceRef = useRef<TranscriptWorkspaceState>(initialTranscriptWorkspaceState);
  const stopRequestedRef = useRef(false);
  const stoppingRef = useRef(false);
  const [workspace, setWorkspace] = useState<TranscriptWorkspaceState>(
    initialTranscriptWorkspaceState,
  );
  const [copyStatus, setCopyStatus] = useState('Transcript has not been copied yet.');

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
      setCopyStatus('Transcript copied to clipboard locally.');
    } catch (error) {
      setCopyStatus(error instanceof Error ? error.message : 'Clipboard copy failed.');
    }
  }

  function downloadTranscript() {
    if (!hasTranscriptText) return;
    const blob = new Blob([`${transcriptText}\n`], { type: 'text/plain;charset=utf-8' });
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

  return (
    <section className="panel transcript" aria-labelledby="transcript-title">
      <div className="transcript-layout">
        <div className="section-heading transcript-heading">
          <p className="eyebrow">Transcription workspace</p>
          <h2 id="transcript-title">Focused push-to-talk dictation</h2>
          <p>
            Hold the control or press {pushToTalkKeyLabel} while this PWA is focused. Audio stays in
            the local capture path; worker ASR output will replace the provisional suffix as model
            integration progresses.
          </p>
        </div>

        <div className="transcript-status-grid" aria-label="Transcript runtime state">
          <StatusPill label="Model" value="Model runtime not active" tone="neutral" />
          <StatusPill
            label="Microphone"
            value={formatCaptureStatus(workspace.status)}
            tone={statusTone(workspace.status)}
          />
          <StatusPill label="Mode" value="Auto/code-switch ready UI" tone="neutral" />
        </div>
      </div>

      <div
        className="transcript-display"
        aria-label="Transcript output"
        aria-live="polite"
        aria-atomic="false"
      >
        {workspace.committed.length > 0 ? (
          <span>{workspace.committed}</span>
        ) : (
          <span className="transcript-placeholder">Transcript will appear here.</span>
        )}
        {displayProvisional.length > 0 ? (
          <span className="transcript-provisional">{displayProvisional}</span>
        ) : null}
      </div>

      <div className="transcript-controls" aria-label="Transcript controls">
        <button
          type="button"
          className="push-to-talk-button"
          aria-label="Hold to talk"
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
          {isPressing ? 'Release to finalize' : 'Hold to talk'}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => void copyTranscript()}
          disabled={!hasTranscriptText}
        >
          Copy
        </button>
        <button
          type="button"
          className="secondary"
          onClick={downloadTranscript}
          disabled={!hasTranscriptText}
        >
          Download .txt
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => updateWorkspace(clearTranscript)}
          disabled={!canClear}
        >
          Clear
        </button>
      </div>

      {workspace.errorMessage ? (
        <p role="alert" className="status-message error-message">
          {workspace.errorMessage} Release the push-to-talk control, verify microphone permission,
          and try again.
        </p>
      ) : null}

      <p className="status-message" aria-live="polite">
        {workspace.statusMessage}
      </p>
      <p className="status-message" aria-live="polite">
        {copyStatus}
      </p>

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
    </section>
  );
}

function StatusPill({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: string;
  readonly tone: 'neutral' | 'good' | 'warn' | 'error';
}) {
  return (
    <div className="status-pill" data-tone={tone}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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
