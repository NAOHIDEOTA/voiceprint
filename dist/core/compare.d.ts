/**
 * 声紋の比較・マージ・ランキング (純関数のみ、モデル不要)
 */
import type { CompareOptions, CompareResult, Voiceprint, VoiceprintJson } from '../types.js';
/**
 * mode ごとのデフォルトしきい値。
 * 同梱の 3D-Speaker (CAM++/ERes2NetV2) 系モデルの実測分布に合わせた値
 * (別話者スコアは概ね 0 付近、同一話者は 0.6〜0.8 に分布する)。
 * しきい値はモデル・録音環境・用途に依存するため固定値を絶対視しないこと。
 */
export declare const THRESHOLDS: Record<'loose' | 'normal' | 'strict', number>;
/** cosine similarity */
export declare function cosineSimilarity(a: Float32Array, b: Float32Array): number;
/**
 * 2つの voiceprint を比較する。
 * 異なるモデル・次元の voiceprint 同士は比較できない (throw)。
 */
export declare function compareVoiceprints(a: Voiceprint, b: Voiceprint, options?: CompareOptions): CompareResult;
/** 同一話者かどうかの簡易判定 */
export declare function isSameSpeaker(a: Voiceprint, b: Voiceprint, options?: CompareOptions): boolean;
/**
 * 複数 voiceprint を平均化し、登録用の代表 voiceprint を作成する (L2 再正規化)
 */
export declare function mergeVoiceprints(voiceprints: Voiceprint[]): Voiceprint;
/**
 * query と複数候補を比較し、スコア降順に返す
 */
export declare function rankVoiceprints(query: Voiceprint, candidates: Voiceprint[], options?: CompareOptions): Array<{
    index: number;
    score: number;
    sameSpeaker: boolean;
}>;
/** voiceprint を JSON 化可能なオブジェクトへ変換 */
export declare function voiceprintToJson(vp: Voiceprint): VoiceprintJson;
/** JSON からの復元 */
export declare function voiceprintFromJson(json: VoiceprintJson): Voiceprint;
//# sourceMappingURL=compare.d.ts.map