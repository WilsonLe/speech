export interface MicrophoneFailureLike {
  readonly code?: string;
  readonly message?: string;
  readonly recoveryStep?: string;
}

export interface MicrophoneBlockerView {
  readonly headline: 'Microphone blocked' | 'No microphone found' | 'Recording interrupted';
  readonly message: string;
  readonly action: string;
}

export function createMicrophoneBlockerView(failure: unknown): MicrophoneBlockerView {
  const failureObject = isMicrophoneFailureLike(failure) ? failure : null;
  const code = failureObject?.code;
  const message = typeof failure === 'string' ? failure : (failureObject?.message ?? '');
  const normalized = `${code ?? ''} ${message}`.toLocaleLowerCase('en-US');

  if (
    code === 'MIC_PERMISSION_DENIED' ||
    normalized.includes('permission') ||
    normalized.includes('notallowed') ||
    normalized.includes('securityerror')
  ) {
    return {
      headline: 'Microphone blocked',
      message: 'Allow microphone access for this site, then try recording again.',
      action: 'Open the browser permission prompt or site settings.',
    };
  }

  if (
    code === 'MIC_DEVICE_NOT_FOUND' ||
    normalized.includes('notfound') ||
    normalized.includes('devicesnotfound') ||
    normalized.includes('no microphone') ||
    normalized.includes('no input')
  ) {
    return {
      headline: 'No microphone found',
      message: 'Connect or choose a microphone, then try again.',
      action: 'Check the browser input device selector if one is available.',
    };
  }

  return {
    headline: 'Recording interrupted',
    message: 'Stop any other app using the microphone, then try again.',
    action: 'Refresh the app if recording still cannot start.',
  };
}

export function formatMicrophoneBlockerText(failure: unknown): string {
  const blocker = createMicrophoneBlockerView(failure);
  return `${blocker.message} ${blocker.action}`;
}

function isMicrophoneFailureLike(value: unknown): value is MicrophoneFailureLike {
  return typeof value === 'object' && value !== null;
}
