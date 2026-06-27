import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ComponentGallery } from './ComponentGallery';
import {
  componentGalleryHashRoute,
  shouldRenderComponentGalleryRoute,
} from './component-gallery-route';

const expectedPrimitiveNames = [
  'Accordion',
  'Button',
  'Dialog',
  'Disclosure',
  'EmptyState',
  'IconButton',
  'InlineError',
  'LoadingState',
  'MenuButton',
  'Notice',
  'Progress',
  'RadioGroup',
  'Select',
  'Status',
  'Toast',
  'Tooltip',
] as const;

describe('component gallery route', () => {
  it('is only reachable through the development hash route', () => {
    expect(shouldRenderComponentGalleryRoute(componentGalleryHashRoute, true)).toEqual({
      shouldRender: true,
      reason: 'development-route',
    });
    expect(shouldRenderComponentGalleryRoute(componentGalleryHashRoute, false)).toEqual({
      shouldRender: false,
      reason: 'not-development',
    });
    expect(shouldRenderComponentGalleryRoute('#dictate', true)).toEqual({
      shouldRender: false,
      reason: 'different-route',
    });
  });

  it('renders usage guidance and every primitive family with synthetic examples', () => {
    const html = renderToString(<ComponentGallery />);

    expect(html).toContain('Development only');
    expect(html).toContain('Component gallery');
    expect(html).toContain('This route is not linked from production navigation');
    expect(html).toContain('Component use');
    expect(html).toContain('Content style');
    expect(html).toContain('Accessibility constraints');
    expect(html).toContain('Required interaction categories');

    for (const primitiveName of expectedPrimitiveNames) {
      expect(html, `${primitiveName} should appear in gallery`).toContain(primitiveName);
    }
  });

  it('keeps gallery examples free of private or domain-owned data fixtures', () => {
    const html = renderToString(<ComponentGallery />);

    expect(html).not.toMatch(/profile-|prompt-|case-|checkpoint|\/home\/|storage path/i);
    expect(html).not.toMatch(/raw audio|feature tensor|adapter weight|private vocabulary/i);
    expect(html).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
  });
});
