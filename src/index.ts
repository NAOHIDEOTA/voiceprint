// Types
export type {
  ModelSize,
  ExtractOptions,
  Voiceprint,
  VoiceQuality,
  VoiceVisualization,
  VoiceprintResult,
  VoiceprintError,
  VoiceprintErrorCode,
  ExtractResult,
  CompareOptions,
  CompareResult,
  VoiceprintJson,
} from './types.js';

// WASM初期化 (通常は自動初期化されるため呼ぶ必要はない)
export { init, initWithBytes } from './core/wasm.js';

// 抽出API
export { extractVoiceprint, VOICEPRINT_VERSION } from './core/extract.js';

// モデル
export { MODELS, DEFAULT_MODEL, DEFAULT_MODEL_BASE_URL, preloadModel } from './core/models.js';
export type { ModelInfo } from './core/models.js';

// 比較API (純関数)
export {
  cosineSimilarity,
  compareVoiceprints,
  isSameSpeaker,
  mergeVoiceprints,
  rankVoiceprints,
  voiceprintToJson,
  voiceprintFromJson,
  THRESHOLDS,
} from './core/compare.js';

// 可視化API
export { voiceprintToHeatmap, vectorToGrid, spectrogramToGrid } from './core/visualize.js';
