/**
 * 純関数 (compare/merge/rank/heatmap/json) + WASM前処理の Node.js テスト
 * 実行: npm run build 後に `node tests/compare.mjs`
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

import {
  cosineSimilarity,
  compareVoiceprints,
  isSameSpeaker,
  mergeVoiceprints,
  rankVoiceprints,
  voiceprintToJson,
  voiceprintFromJson,
  voiceprintToHeatmap,
  vectorToGrid,
  THRESHOLDS,
  initWithBytes,
} from '../dist/index.js';
import { callPreprocess } from '../dist/core/wasm.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (e) {
    console.error(`  FAIL - ${name}`);
    console.error(e);
    process.exitCode = 1;
  }
}

function makeVoiceprint(vector, model = 'campplus-voxceleb') {
  const v = Float32Array.from(vector);
  let norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return {
    version: '1',
    model,
    dimension: v.length,
    vector: v.map((x) => x / norm),
    norm: 'l2',
    sampleRate: 16000,
    durationMs: 5000,
    speechMs: 4000,
  };
}

console.log('# compare');

test('cosineSimilarity: identical vectors = 1', () => {
  const a = Float32Array.from([1, 2, 3]);
  assert.ok(Math.abs(cosineSimilarity(a, a) - 1) < 1e-6);
});

test('cosineSimilarity: orthogonal vectors = 0', () => {
  const a = Float32Array.from([1, 0]);
  const b = Float32Array.from([0, 1]);
  assert.ok(Math.abs(cosineSimilarity(a, b)) < 1e-6);
});

test('cosineSimilarity: dimension mismatch throws', () => {
  assert.throws(() => cosineSimilarity(Float32Array.from([1]), Float32Array.from([1, 2])));
});

test('compareVoiceprints: same vector → sameSpeaker true / high confidence', () => {
  const a = makeVoiceprint([0.1, 0.5, -0.3, 0.8]);
  const r = compareVoiceprints(a, a, { mode: 'strict' });
  assert.equal(r.sameSpeaker, true);
  assert.equal(r.threshold, THRESHOLDS.strict);
  assert.equal(r.confidence, 'high');
});

test('compareVoiceprints: different models throw', () => {
  const a = makeVoiceprint([1, 0], 'campplus-voxceleb');
  const b = makeVoiceprint([1, 0], 'resnet152-voxceleb');
  assert.throws(() => compareVoiceprints(a, b));
});

test('compareVoiceprints: threshold option overrides mode', () => {
  const a = makeVoiceprint([1, 0, 0]);
  const b = makeVoiceprint([0.8, 0.6, 0]);
  const r = compareVoiceprints(a, b, { threshold: 0.5, mode: 'strict' });
  assert.equal(r.threshold, 0.5);
  assert.equal(r.sameSpeaker, r.score >= 0.5);
});

test('isSameSpeaker: boolean shortcut', () => {
  const a = makeVoiceprint([1, 0, 0]);
  assert.equal(isSameSpeaker(a, a), true);
});

console.log('# merge / rank');

test('mergeVoiceprints: mean is L2 normalized', () => {
  const a = makeVoiceprint([1, 0, 0, 0]);
  const b = makeVoiceprint([0, 1, 0, 0]);
  const m = mergeVoiceprints([a, b]);
  const norm = Math.sqrt(m.vector.reduce((s, x) => s + x * x, 0));
  assert.ok(Math.abs(norm - 1) < 1e-6);
  assert.equal(m.dimension, 4);
});

test('mergeVoiceprints: empty array throws', () => {
  assert.throws(() => mergeVoiceprints([]));
});

test('rankVoiceprints: sorted by score desc with original index', () => {
  const q = makeVoiceprint([1, 0, 0]);
  const far = makeVoiceprint([0, 1, 0]);
  const near = makeVoiceprint([0.9, 0.1, 0]);
  const ranked = rankVoiceprints(q, [far, near]);
  assert.equal(ranked[0].index, 1);
  assert.ok(ranked[0].score > ranked[1].score);
});

test('rankVoiceprints: different models throw', () => {
  const q = makeVoiceprint([1, 0, 0], 'campplus-voxceleb');
  const other = makeVoiceprint([1, 0, 0], 'resnet152-voxceleb');
  assert.throws(() => rankVoiceprints(q, [other]));
});

test('mergeVoiceprints: invalid vector dimension throws', () => {
  const a = makeVoiceprint([1, 0, 0]);
  const b = { ...makeVoiceprint([0, 1]), dimension: 3 };
  assert.throws(() => mergeVoiceprints([a, b]));
});

console.log('# json / heatmap');

test('voiceprintToJson / fromJson roundtrip', () => {
  const a = makeVoiceprint([0.1, -0.2, 0.3, 0.4]);
  const json = voiceprintToJson(a);
  assert.ok(Array.isArray(json.vector));
  const restored = voiceprintFromJson(JSON.parse(JSON.stringify(json)));
  assert.ok(restored.vector instanceof Float32Array);
  assert.ok(Math.abs(cosineSimilarity(a.vector, restored.vector) - 1) < 1e-6);
});

test('voiceprintFromJson: dimension mismatch throws', () => {
  const a = voiceprintToJson(makeVoiceprint([1, 0, 0]));
  a.dimension = 5;
  assert.throws(() => voiceprintFromJson(a));
});

test('voiceprintToHeatmap: 192次元 → 12行 × 16列, 値は0..1', () => {
  const a = makeVoiceprint(Array.from({ length: 192 }, (_, i) => Math.sin(i)));
  const grid = voiceprintToHeatmap(a, { cols: 16 });
  assert.equal(grid.length, 12);
  assert.equal(grid[0].length, 16);
  for (const row of grid) {
    for (const v of row) assert.ok(v >= 0 && v <= 1);
  }
});

test('vectorToGrid: invalid cols throws', () => {
  assert.throws(() => vectorToGrid([1, 2, 3], 0));
});

console.log('# wasm preprocess');

const wasmPath = fileURLToPath(new URL('../pkg/voiceprint_wasm_bg.wasm', import.meta.url));
initWithBytes(readFileSync(wasmPath));

function speechLike(seconds) {
  const n = 16000 * seconds;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / 16000;
    const env = 0.5 + 0.5 * Math.sin(2 * Math.PI * 2 * t);
    out[i] = 0.4 * env * Math.sin(2 * Math.PI * 180 * t);
  }
  return out;
}

const pre = await callPreprocess(speechLike(4), 16000, { returnSpectrogram: true });

test('preprocess: features shape', () => {
  assert.equal(pre.numBins, 80);
  assert.ok(pre.numFrames > 100);
  assert.equal(pre.features.length, pre.numFrames * pre.numBins);
});

test('preprocess: speech detected', () => {
  assert.equal(pre.durationMs, 4000);
  assert.ok(pre.speechMs > 2000, `speechMs = ${pre.speechMs}`);
  assert.equal(pre.clipping, false);
});

test('preprocess: spectrogram returned', () => {
  assert.ok(pre.spectrogram);
  assert.equal(pre.spectrogram.length, pre.spectrogramFrames * pre.spectrogramBins);
});

const silence = await callPreprocess(new Float32Array(16000 * 3), 16000, {});

test('preprocess: silence has no speech', () => {
  assert.equal(silence.speechMs, 0);
  assert.equal(silence.numFrames, 0);
});

console.log(`\n${passed} tests passed${process.exitCode ? ' (with failures)' : ''}`);
