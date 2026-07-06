/**
 * 可視化ユーティリティ (ヒートマップ変換など)
 */
import type { Voiceprint } from '../types.js';
/**
 * voiceprint vector をヒートマップ表示用の2次元配列 (0..1 正規化) に変換する。
 * 人間が見て一致判定するためのものではない (説明用)。
 */
export declare function voiceprintToHeatmap(voiceprint: Voiceprint, options?: {
    cols?: number;
    normalize?: boolean;
}): number[][];
/** フラットなベクトルを rows × cols のグリッドに変換 */
export declare function vectorToGrid(vector: Float32Array | number[], cols?: number, normalize?: boolean): number[][];
/**
 * WASM から返ったフラットなスペクトログラムを number[][] (時間 × 周波数) に変換
 */
export declare function spectrogramToGrid(flat: number[], frames: number, bins: number): number[][];
//# sourceMappingURL=visualize.d.ts.map