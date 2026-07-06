import initWasm, { initSync, preprocess as wasmPreprocess } from '../../pkg/voiceprint_wasm.js';
import type { WasmPreprocessOutput } from '../types.js';

let initialized = false;
let initPromise: Promise<void> | null = null;

/**
 * WASMモジュールを初期化（ブラウザ用・非同期）
 * 通常は自動初期化されるため呼ぶ必要はない
 */
export async function init(wasmUrl?: string | URL): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;
  initPromise = initWasm(wasmUrl).then(() => {
    initialized = true;
  });
  return initPromise;
}

/**
 * WASMモジュールを初期化（Node.js用・同期）
 */
export function initWithBytes(wasmBytes: BufferSource): void {
  if (initialized) return;
  initSync({ module: wasmBytes });
  initialized = true;
}

export type WasmPreprocessOptions = {
  vad?: boolean;
  normalize?: boolean;
  returnSpectrogram?: boolean;
  /** CMN (フレーム平均減算)。モデルの ONNX metadata に合わせる */
  cmn?: boolean;
  /** 波形の int16 レンジスケール。モデルの ONNX metadata に合わせる */
  int16Scale?: boolean;
};

/**
 * 音声前処理 (リサンプル→正規化→VAD→fbank) を WASM で実行
 */
export async function callPreprocess(
  samples: Float32Array,
  sampleRate: number,
  options: WasmPreprocessOptions,
): Promise<WasmPreprocessOutput> {
  await init();
  return wasmPreprocess(samples, sampleRate, options) as WasmPreprocessOutput;
}
