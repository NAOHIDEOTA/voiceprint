/**
 * 声紋抽出のメインパイプライン:
 * デコード → WASM前処理 (リサンプル/正規化/VAD/fbank) → ONNX 推論 → L2 正規化
 */
import type { ExtractOptions, ExtractResult } from '../types.js';
/** voiceprint フォーマットのバージョン */
export declare const VOICEPRINT_VERSION = "1";
/**
 * 音声から voiceprint を抽出する
 */
export declare function extractVoiceprint(audio: Blob | ArrayBuffer | Float32Array, options?: ExtractOptions): Promise<ExtractResult>;
//# sourceMappingURL=extract.d.ts.map