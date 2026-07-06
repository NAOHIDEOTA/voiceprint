/**
 * 実モデルでのエンドツーエンド推論検証 (models/ が必要: make models)
 * 実行: node tests/inference.mjs [small|base|large]
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

import { extractVoiceprint, compareVoiceprints, initWithBytes, MODELS } from '../dist/index.js';

const size = process.argv[2] ?? 'small';
const modelPath = fileURLToPath(new URL(`../models/${MODELS[size].file}`, import.meta.url));
if (!existsSync(modelPath)) {
  console.error(`model not found: ${modelPath}\nrun \`make models\` first`);
  process.exit(1);
}

// Node では fetch(file URL) が使えないため、Cache Storage も無い素の fetch を
// ファイル読み込みに差し替える
const origFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith('file://')) {
    const buf = readFileSync(fileURLToPath(u));
    return new Response(buf, { status: 200 });
  }
  return origFetch(url, init);
};

const wasmPath = fileURLToPath(new URL('../pkg/voiceprint_wasm_bg.wasm', import.meta.url));
initWithBytes(readFileSync(wasmPath));

const modelBaseUrl = pathToFileURL(fileURLToPath(new URL('../models', import.meta.url))).href;

/** 話者を模した音声: 基本周波数 + 倍音 + AM エンベロープ + わずかなノイズ */
function fakeSpeaker(f0, seconds = 5, seed = 1) {
  const n = 16000 * seconds;
  const out = new Float32Array(n);
  let s = seed >>> 0;
  for (let i = 0; i < n; i++) {
    const t = i / 16000;
    const env = 0.55 + 0.45 * Math.sin(2 * Math.PI * 2.3 * t + seed);
    let v = 0;
    for (let h = 1; h <= 6; h++) {
      v += Math.sin(2 * Math.PI * f0 * h * t) / h;
    }
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const noise = ((s >>> 16) / 32768 - 1) * 0.02;
    out[i] = 0.3 * env * v + noise;
  }
  return out;
}

console.log(`# inference test: ${size} (${MODELS[size].file})`);

const opts = { model: size, modelBaseUrl, returnSpectrogram: true };

const a1 = await extractVoiceprint(fakeSpeaker(120, 5, 1), opts);
assert.equal(a1.ok, true, `extract failed: ${JSON.stringify(a1)}`);
console.log(`  ok - extract: dim=${a1.voiceprint.dimension}, speech=${a1.voiceprint.speechMs}ms`);
assert.equal(a1.voiceprint.dimension, MODELS[size].dimension, 'dimension matches MODELS');

// L2 正規化されていること
const norm = Math.sqrt(a1.voiceprint.vector.reduce((s, x) => s + x * x, 0));
assert.ok(Math.abs(norm - 1) < 1e-4, `norm = ${norm}`);
console.log('  ok - vector is L2 normalized');

// 同一音声 → スコア ≈ 1
const a2 = await extractVoiceprint(fakeSpeaker(120, 5, 1), opts);
const same = compareVoiceprints(a1.voiceprint, a2.voiceprint);
assert.ok(same.score > 0.999, `same audio score = ${same.score}`);
console.log(`  ok - identical audio score = ${same.score.toFixed(4)}`);

// 異なる音源 → 同一音声よりスコアが下がる
const b = await extractVoiceprint(fakeSpeaker(280, 5, 9), opts);
const diff = compareVoiceprints(a1.voiceprint, b.voiceprint);
assert.ok(diff.score < same.score, `diff=${diff.score} vs same=${same.score}`);
console.log(`  ok - different source score = ${diff.score.toFixed(4)} (< same)`);

// 可視化
assert.ok(a1.visualization.spectrogram.length > 0);
assert.ok(a1.visualization.vectorHeatmap.length === MODELS[size].dimension / 16);
console.log('  ok - visualization (spectrogram + heatmap)');

// 無音 → NO_SPEECH_DETECTED
const silent = await extractVoiceprint(new Float32Array(16000 * 4), opts);
assert.equal(silent.ok, false);
assert.equal(silent.code, 'NO_SPEECH_DETECTED');
console.log('  ok - silence → NO_SPEECH_DETECTED');

// 短すぎる発話 → SPEECH_TOO_SHORT
const short = await extractVoiceprint(fakeSpeaker(120, 1, 1), opts);
assert.equal(short.ok, false);
assert.equal(short.code, 'SPEECH_TOO_SHORT');
console.log('  ok - 1s audio → SPEECH_TOO_SHORT');

console.log('\nall inference tests passed');
