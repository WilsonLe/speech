import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the product foundation shell', () => {
    const html = renderToString(<App />);

    expect(html).toContain('Local-first bilingual dictation');
    expect(html).toContain('Privacy baseline');
    expect(html).toContain('Implementation roadmap');
  });
});
