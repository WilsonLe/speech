export interface PwaLifecycleSnapshot {
  readonly serviceWorkerSupported: boolean;
  readonly registrationState: 'idle' | 'registering' | 'registered' | 'unsupported' | 'error';
  readonly offlineReady: boolean;
  readonly updateAvailable: boolean;
  readonly registrationScope: string | null;
  readonly errorMessage: string | null;
}

export interface PwaRegisterOptions {
  readonly immediate?: boolean;
  readonly onRegisteredSW?: (
    scriptUrl: string,
    registration: ServiceWorkerRegistration | undefined,
  ) => void;
  readonly onOfflineReady?: () => void;
  readonly onNeedRefresh?: () => void;
  readonly onRegisterError?: (error: unknown) => void;
}

export type PwaRegisterFunction = (
  options: PwaRegisterOptions,
) => (reloadPage?: boolean) => Promise<void>;

export type PwaLifecycleListener = (snapshot: PwaLifecycleSnapshot) => void;

const initialSnapshot: PwaLifecycleSnapshot = {
  serviceWorkerSupported: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
  registrationState:
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? 'idle' : 'unsupported',
  offlineReady: false,
  updateAvailable: false,
  registrationScope: null,
  errorMessage: null,
};

let snapshot = initialSnapshot;
let initialized = false;
let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null = null;
const listeners = new Set<PwaLifecycleListener>();

export function initPwaLifecycle(registerSW: PwaRegisterFunction): void {
  if (initialized) return;
  initialized = true;
  if (!snapshot.serviceWorkerSupported) {
    notify();
    return;
  }

  setSnapshot({ registrationState: 'registering' });
  updateServiceWorker = registerSW({
    immediate: true,
    onRegisteredSW(_scriptUrl, registration) {
      setSnapshot({
        registrationState: 'registered',
        registrationScope: registration?.scope ?? null,
      });
    },
    onOfflineReady() {
      setSnapshot({ offlineReady: true, registrationState: 'registered' });
    },
    onNeedRefresh() {
      setSnapshot({ updateAvailable: true, registrationState: 'registered' });
    },
    onRegisterError(error) {
      setSnapshot({
        registrationState: 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    },
  });
}

export function subscribePwaLifecycle(listener: PwaLifecycleListener): () => void {
  listeners.add(listener);
  listener(snapshot);
  return () => {
    listeners.delete(listener);
  };
}

export async function activatePwaUpdate(): Promise<void> {
  if (updateServiceWorker === null) return;
  await updateServiceWorker(true);
}

export function getPwaLifecycleSnapshot(): PwaLifecycleSnapshot {
  return snapshot;
}

function setSnapshot(patch: Partial<PwaLifecycleSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  notify();
}

function notify(): void {
  for (const listener of listeners) {
    listener(snapshot);
  }
}
