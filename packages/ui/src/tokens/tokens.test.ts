import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { speechTokenContracts, speechTokenCssEntry } from './index';

const tokenDirectory = dirname(fileURLToPath(import.meta.url));

async function readTokenCss(fileName: string): Promise<string> {
  return readFile(join(tokenDirectory, fileName), 'utf8');
}

describe('semantic UI token contract', () => {
  it('exports the CSS entrypoint used by application shells', () => {
    expect(speechTokenCssEntry).toBe('@speech/ui/tokens.css');
  });

  it('defines all required token categories with documented CSS prefixes', async () => {
    expect(speechTokenContracts.map((contract) => contract.category)).toEqual([
      'spacing',
      'typography',
      'colour',
      'motion',
      'elevation',
    ]);

    for (const contract of speechTokenContracts) {
      expect(contract.intent.length).toBeGreaterThan(40);
      const css = await readTokenCss(contract.cssFile);
      expect(css).toContain(':root');
      for (const prefix of contract.requiredPrefixes) {
        expect(css, `${contract.cssFile} should define ${prefix} tokens`).toContain(prefix);
      }
    }
  });

  it('includes accessibility and responsive hooks in token CSS', async () => {
    const [spacing, colour, motion, elevation] = await Promise.all([
      readTokenCss('spacing.css'),
      readTokenCss('colour.css'),
      readTokenCss('motion.css'),
      readTokenCss('elevation.css'),
    ]);

    expect(spacing).toContain('--speech-size-touch-target: 2.75rem');
    expect(spacing).toContain('@media (width <= 44rem)');
    expect(colour).toContain('--speech-focus-ring-color');
    expect(colour).toContain('@media (forced-colors: active)');
    expect(motion).toContain('@media (prefers-reduced-motion: reduce)');
    expect(elevation).toContain('--speech-layer-dialog');
  });

  it('keeps aggregate token CSS as imports only so apps can tree-shake by entrypoint later', async () => {
    const indexCss = await readTokenCss('index.css');
    expect(indexCss.trim().split('\n')).toEqual([
      "@import './spacing.css';",
      "@import './typography.css';",
      "@import './colour.css';",
      "@import './motion.css';",
      "@import './elevation.css';",
    ]);
  });
});
