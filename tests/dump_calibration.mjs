/**
 * int8 静的量子化のキャリブレーション用に、実音声 (公開テストWAV) の
 * fbank 特徴量を JSON で書き出す。
 * 実行: node tests/dump_calibration.mjs <出力dir>
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { initWithBytes } from '../dist/index.js';
import { callPreprocess } from '../dist/core/wasm.js';

const outDir = process.argv[2] ?? '/tmp/calib';
mkdirSync(outDir, { recursive: true });
const wavDir = `${outDir}/wavs`;
mkdirSync(wavDir, { recursive: true });

// 公開テスト音声 (Apache-2.0 のリポジトリ/リリースに含まれるサンプル)
const SOURCES = [
  ...['speaker1_a_en_16k', 'speaker1_b_en_16k', 'speaker2_a_en_16k',
      'speaker1_a_cn_16k', 'speaker1_b_cn_16k', 'speaker2_a_cn_16k']
    .map((n) => `https://github.com/csukuangfj/sr-data/raw/main/test/3d-speaker/${n}.wav`),
  ...['fangjun-sr-1', 'fangjun-test-sr-1', 'leijun-sr-1', 'leijun-test-sr-1']
    .map((n) => `https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/${n}.wav`),
];

for (const url of SOURCES) {
  const name = url.split('/').pop();
  const dest = `${wavDir}/${name}`;
  if (!existsSync(dest)) {
    console.log(`download: ${name}`);
    execFileSync('curl', ['-sfL', '-o', dest, url]);
  }
}

const wasmPath = fileURLToPath(new URL('../pkg/voiceprint_wasm_bg.wasm', import.meta.url));
initWithBytes(readFileSync(wasmPath));

// 16-bit PCM WAV (data チャンク探索付き) → Float32Array
function readWav(path) {
  const buf = readFileSync(path);
  const channels = buf.readUInt16LE(22);
  let off = 12;
  while (off < buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'data') {
      const out = new Float32Array(Math.floor(size / 2 / channels));
      for (let i = 0; i < out.length; i++) out[i] = buf.readInt16LE(off + 8 + i * 2 * channels) / 32768;
      return out;
    }
    off += 8 + size;
  }
  throw new Error(`no data chunk: ${path}`);
}

let count = 0;
for (const url of SOURCES) {
  const name = url.split('/').pop();
  const samples = readWav(`${wavDir}/${name}`);
  const pre = await callPreprocess(samples, 16000, { cmn: true, int16Scale: false });
  if (pre.numFrames === 0) continue;
  writeFileSync(
    `${outDir}/${name.replace('.wav', '')}.json`,
    JSON.stringify({ frames: pre.numFrames, bins: pre.numBins, data: pre.features }),
  );
  count++;
}
console.log(`calibration samples: ${count} -> ${outDir}`);
