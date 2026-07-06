/** モデルサイズ (3段階) */
export type ModelSize = 'small' | 'base' | 'large';
/** 抽出オプション */
export type ExtractOptions = {
    /** Float32Array 入力時のサンプルレート。default: 16000 */
    sampleRate?: number;
    /** 必要最低発話時間 (ms)。default: 3000 */
    minSpeechMs?: number;
    /** 音量正規化。default: true */
    normalize?: boolean;
    /** VAD (発話区間検出)。default: true */
    vad?: boolean;
    /** スペクトログラムを結果に含める */
    returnSpectrogram?: boolean;
    /** 使用モデル。default: 'base' */
    model?: ModelSize;
    /** モデル配布 URL の上書き (セルフホスト用) */
    modelBaseUrl?: string;
};
/** 声紋ベクトル */
export type Voiceprint = {
    version: string;
    model: string;
    dimension: number;
    vector: Float32Array;
    norm: 'l2';
    sampleRate: number;
    durationMs: number;
    speechMs: number;
};
/** 音声品質情報 */
export type VoiceQuality = {
    speechMs: number;
    durationMs: number;
    clipping: boolean;
    volumeLevel?: number;
    snrEstimate?: number;
    warnings: string[];
};
/** 可視化データ */
export type VoiceVisualization = {
    spectrogram?: number[][];
    vectorHeatmap?: number[][];
};
/** 抽出成功 */
export type VoiceprintResult = {
    ok: true;
    voiceprint: Voiceprint;
    quality: VoiceQuality;
    visualization?: VoiceVisualization;
};
export type VoiceprintErrorCode = 'AUDIO_DECODE_FAILED' | 'NO_SPEECH_DETECTED' | 'SPEECH_TOO_SHORT' | 'MODEL_LOAD_FAILED' | 'INFERENCE_FAILED' | 'UNSUPPORTED_BROWSER' | 'MIC_PERMISSION_DENIED';
/** 抽出失敗 */
export type VoiceprintError = {
    ok: false;
    code: VoiceprintErrorCode;
    message: string;
    details?: unknown;
};
/** extractVoiceprint の戻り値 (判別可能 union) */
export type ExtractResult = VoiceprintResult | VoiceprintError;
/** 比較オプション */
export type CompareOptions = {
    /** しきい値の直接指定 (mode より優先) */
    threshold?: number;
    /** しきい値プリセット。default: 'normal' */
    mode?: 'loose' | 'normal' | 'strict';
};
/** 比較結果 */
export type CompareResult = {
    score: number;
    threshold: number;
    sameSpeaker: boolean;
    confidence: 'low' | 'medium' | 'high';
};
/** JSON export 用のシリアライズ形式 (vector は number[]) */
export type VoiceprintJson = Omit<Voiceprint, 'vector'> & {
    vector: number[];
};
/** WASM preprocess() の戻り値 (内部用) */
export type WasmPreprocessOutput = {
    features: number[];
    numFrames: number;
    numBins: number;
    durationMs: number;
    speechMs: number;
    clipping: boolean;
    volumeLevel: number;
    snrEstimate: number | null;
    spectrogram: number[] | null;
    spectrogramFrames: number;
    spectrogramBins: number;
};
//# sourceMappingURL=types.d.ts.map