import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { DIAGRAM_MAX_BYTES, diagramProblems, svgContentProblems } from '../scripts/lib/svg.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the docs example is a small svg without scripts or external references', () => {
  const text = fs.readFileSync(path.join(root, 'docs/diagrams/example-library.svg'), 'utf8');
  assert.deepEqual(svgContentProblems(text), []);
  assert.equal(Buffer.byteLength(text) <= DIAGRAM_MAX_BYTES, true);
  assert.match(text, /開源程式庫/);
  assert.match(text, /WenQuanYi Micro Hei/);
});

test('svg sanitizer rejects scripts, event handlers, and external references', () => {
  assert.deepEqual(svgContentProblems('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), []);
  assert.ok(svgContentProblems('<svg></svg><script>alert(1)</script>').some((problem) => /script/.test(problem)));
  assert.ok(svgContentProblems('<svg><&#115;cript>bad</&#115;cript></svg>').some((problem) => /script/.test(problem)));
  assert.ok(svgContentProblems('<svg onload="alert(1)"></svg>').some((problem) => /事件/.test(problem)));
  assert.ok(svgContentProblems('<svg><image href="https://example.com/a.png"/></svg>').some((problem) => /外部參照/.test(problem)));
  assert.ok(svgContentProblems('<svg><rect style="fill:url(https://example.com/a)"/></svg>').some((problem) => /外部網址/.test(problem)));
  assert.ok(svgContentProblems('<svg><a href="javascript:alert(1)">x</a></svg>').some((problem) => /javascript/.test(problem)));
  assert.deepEqual(svgContentProblems('<svg><line marker-end="url(#arrow)"/></svg>'), []);
});

test('a diagram must sit beside its own item and stay under the size limit', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diagram-'));
  const dataDir = path.join(dir, 'data');
  fs.mkdirSync(path.join(dataDir, 'diagrams', '2026-09-30'), { recursive: true });
  const src = 'data/diagrams/2026-09-30/42.svg';
  const file = path.join(dir, src);
  fs.writeFileSync(file, '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  assert.deepEqual(diagramProblems({
    diagram: { src, alt: '說明', caption: '圖說' },
    date: '2026-09-30',
    id: 42,
    dataDir,
  }), []);

  const escaped = diagramProblems({
    diagram: { src: 'data/diagrams/2026-09-30/../secret.svg', alt: '說明', caption: '圖說' },
    date: '2026-09-30',
    id: 42,
    dataDir,
  });
  assert.ok(escaped.length > 0);

  fs.writeFileSync(file, '<svg onload="x"></svg>');
  assert.ok(diagramProblems({
    diagram: { src, alt: '說明', caption: '圖說' },
    date: '2026-09-30',
    id: 42,
    dataDir,
  }).some((problem) => /事件/.test(problem)));

  fs.writeFileSync(file, `<svg></svg>${'x'.repeat(DIAGRAM_MAX_BYTES)}`);
  assert.ok(diagramProblems({
    diagram: { src, alt: '說明', caption: '圖說' },
    date: '2026-09-30',
    id: 42,
    dataDir,
  }).some((problem) => /超過/.test(problem)));
});
