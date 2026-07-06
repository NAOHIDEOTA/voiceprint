/**
 * speaker embedding ONNX モデルのロードとキャッシュ。
 * 既定では Cache Storage に永続化し、2回目以降は再ダウンロードしない。
 */
import type { InferenceSession } from 'onnxruntime-web';
import type { ModelSize } from '../types.js';
/**
 * 既定の配布先。GitHub Release アセット (3D-Speaker 由来の ONNX, Apache-2.0)。
 * 利用側で modelBaseUrl を渡せば上書き可能。
 */
export declare const DEFAULT_MODEL_BASE_URL = "https://github.com/NAOHIDEOTA/voiceprint/releases/download/models-v1";
export type ModelInfo = {
    file: string;
    /** 埋め込み次元 */
    dimension: number;
    /** おおよそのダウンロードサイズ (MB)。UI 表示用 */
    approxSizeMb: number;
    /** Voiceprint.model に記録する識別名 */
    name: string;
    /** モデルが期待する特徴量前処理 (ONNX metadata 由来) */
    preprocess: {
        /** feature_normalize_type="global-mean" なら true */
        cmn: boolean;
        /** normalize_samples=0 (int16 レンジの波形を想定) なら true */
        int16Scale: boolean;
    };
};
export declare const MODELS: Record<ModelSize, ModelInfo>;
export declare const DEFAULT_MODEL: ModelSize;
export declare function loadOrt(): Promise<typeof import('onnxruntime-web')>;
/**
 * モデルの ONNX セッションを取得 (シングルトンキャッシュ)
 */
export declare function getSession(size: ModelSize, baseUrl: string): Promise<InferenceSession>;
/**
 * モデルを事前ロードする (初回抽出の待ち時間を減らしたい場合に任意で使用)
 */
export declare function preloadModel(size?: ModelSize, baseUrl?: string): Promise<void>;
//# sourceMappingURL=models.d.ts.map