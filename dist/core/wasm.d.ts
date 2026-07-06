import type { WasmPreprocessOutput } from '../types.js';
/**
 * WASMモジュールを初期化（ブラウザ用・非同期）
 * 通常は自動初期化されるため呼ぶ必要はない
 */
export declare function init(wasmUrl?: string | URL): Promise<void>;
/**
 * WASMモジュールを初期化（Node.js用・同期）
 */
export declare function initWithBytes(wasmBytes: BufferSource): void;
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
export declare function callPreprocess(samples: Float32Array, sampleRate: number, options: WasmPreprocessOptions): Promise<WasmPreprocessOutput>;
//# sourceMappingURL=wasm.d.ts.map