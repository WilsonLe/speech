import { useId, type HTMLAttributes } from 'react';
import type { SpeechLiveRegionMode } from './contracts';

export function useResolvedId(id: string | undefined, suffix?: string): string {
  const generatedId = useId();
  return id ?? (suffix ? `${generatedId}-${suffix}` : generatedId);
}

export function mergeClassNames(...classes: readonly (string | undefined)[]): string | undefined {
  const value = classes.filter(Boolean).join(' ');
  return value || undefined;
}

export function mergeAriaDescriptions(...ids: readonly (string | undefined)[]): string | undefined {
  const merged = ids.flatMap((id) => id?.split(/\s+/) ?? []).filter(Boolean);

  if (merged.length === 0) {
    return undefined;
  }

  return [...new Set(merged)].join(' ');
}

export function liveRegionAttributes(
  live: SpeechLiveRegionMode,
): Pick<HTMLAttributes<HTMLElement>, 'aria-live' | 'aria-atomic'> {
  if (live === 'off') {
    return {};
  }

  return { 'aria-atomic': true, 'aria-live': live };
}
