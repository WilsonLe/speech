import { describe, expect, it, vi } from 'vitest';
import {
  focusPrimaryDestinationHeading,
  getInitialPrimaryDestinationId,
  getPrimaryDestination,
  primaryDestinations,
} from './routeState';

describe('v0.6 primary destination route state', () => {
  it('defines exactly the three persistent primary destinations', () => {
    expect(primaryDestinations.map((destination) => destination.label)).toEqual([
      'Dictate',
      'Vocabulary',
      'Models',
    ]);
    expect(primaryDestinations.map((destination) => destination.href)).toEqual([
      '#dictate',
      '#vocabulary',
      '#models',
    ]);
  });

  it('maps legacy/current panel hashes to the owning primary destination', () => {
    expect(getInitialPrimaryDestinationId(undefined)).toBe('dictate');
    expect(getInitialPrimaryDestinationId('#transcript-title')).toBe('dictate');
    expect(getInitialPrimaryDestinationId('#transcript-privacy-title')).toBe('dictate');
    expect(getInitialPrimaryDestinationId('#vocabulary-title')).toBe('vocabulary');
    expect(getInitialPrimaryDestinationId('#personal-models-title')).toBe('models');
    expect(getInitialPrimaryDestinationId('#offline-model-title')).toBe('models');
    expect(getInitialPrimaryDestinationId('#diagnostics-title')).toBe('models');
    expect(getInitialPrimaryDestinationId('#benchmark-title')).toBe('models');
    expect(getInitialPrimaryDestinationId('#runtime-title')).toBe('models');
    expect(getInitialPrimaryDestinationId('#roadmap-title')).toBe('models');
    expect(getInitialPrimaryDestinationId('#unknown-advanced-panel')).toBe('dictate');
  });

  it('focuses the destination heading without requiring app code to know heading IDs', () => {
    const focus = vi.fn();
    const heading = {
      focus,
      hasAttribute: (name: string) => name === 'tabindex',
    } as unknown as HTMLElement;
    const documentRef = {
      getElementById: vi.fn((id: string) =>
        id === getPrimaryDestination('models').headingId ? heading : null,
      ),
    } as Pick<Document, 'getElementById'>;

    expect(focusPrimaryDestinationHeading('models', documentRef)).toBe(true);
    expect(documentRef.getElementById).toHaveBeenCalledWith('personal-models-title');
    expect(focus).toHaveBeenCalledWith({ preventScroll: false });
  });
});
