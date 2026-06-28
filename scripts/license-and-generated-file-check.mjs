import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const ignoredDirectories = new Set([
  '.git',
  '.venv',
  'node_modules',
  'dist',
  'coverage',
  'playwright-report',
  'test-results',
  '.pytest_cache',
  '.ruff_cache',
]);
const forbiddenExtensions = new Set([
  '.onnx',
  '.pt',
  '.pth',
  '.ckpt',
  '.safetensors',
  '.wav',
  '.flac',
  '.mp3',
  '.m4a',
  '.opus',
  '.speechprofile',
]);
const allowedRootMarkdown = new Set([
  'README.md',
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
  'SECURITY.md',
  'GOVERNANCE.md',
  'MODEL_LICENSES.md',
  'THIRD_PARTY_NOTICES.md',
]);
const allowedMockOnnxFiles = new Set([
  'model-packs/example-manifest/files/encoder.onnx',
  'model-packs/example-manifest/files/joiner.onnx',
  'model-packs/example-manifest/files/predictor.onnx',
]);

const failures = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    const relativePath = path.relative(root, fullPath);

    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        await walk(fullPath);
      }
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    if (forbiddenExtensions.has(extension) && !allowedMockOnnxFiles.has(relativePath)) {
      failures.push(`Forbidden speech/model artifact committed: ${relativePath}`);
    }

    if (extension === '.md') {
      const inAllowedInstructionDocs = /^docs\/instructions\/[^/]+\.instructions\.md$/.test(
        relativePath,
      );
      const inAllowedTroubleshootingDocs =
        /^docs\/troubleshooting\/troubleshoot-[^/]+\.instructions\.md$/.test(relativePath);
      const inAllowedAdrDocs = /^docs\/adr\/[^/]+\.md$/.test(relativePath);
      const inAllowedResearchDocs = /^docs\/research\/[^/]+\.md$/.test(relativePath);
      const rootCommunityFile =
        !relativePath.includes(path.sep) && allowedRootMarkdown.has(relativePath);
      const githubMetadata = relativePath.startsWith('.github/');
      const testDataLicense = relativePath === 'test-data/LICENSES.md';

      if (
        !inAllowedInstructionDocs &&
        !inAllowedTroubleshootingDocs &&
        !inAllowedAdrDocs &&
        !inAllowedResearchDocs &&
        !rootCommunityFile &&
        !githubMetadata &&
        !testDataLicense
      ) {
        failures.push(
          `Markdown docs must live in docs/instructions/*.instructions.md, docs/troubleshooting/troubleshoot-*.instructions.md, docs/adr/*.md, or docs/research/*.md: ${relativePath}`,
        );
      }
    }

    const fileStat = await stat(fullPath);
    if (relativePath.startsWith('model-packs/') && fileStat.size > 5_000_000) {
      failures.push(`Large model-pack file should not be committed: ${relativePath}`);
    }
  }
}

await walk(root);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('license/generated-file check passed');
