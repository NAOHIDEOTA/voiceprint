export type { ModelSize, ExtractOptions, Voiceprint, VoiceQuality, VoiceVisualization, VoiceprintResult, VoiceprintError, VoiceprintErrorCode, ExtractResult, CompareOptions, CompareResult, VoiceprintJson, } from './types.js';
export { init, initWithBytes } from './core/wasm.js';
export { extractVoiceprint, VOICEPRINT_VERSION } from './core/extract.js';
export { MODELS, DEFAULT_MODEL, DEFAULT_MODEL_BASE_URL, preloadModel } from './core/models.js';
export type { ModelInfo } from './core/models.js';
export { cosineSimilarity, compareVoiceprints, isSameSpeaker, mergeVoiceprints, rankVoiceprints, voiceprintToJson, voiceprintFromJson, THRESHOLDS, } from './core/compare.js';
export { voiceprintToHeatmap, vectorToGrid, spectrogramToGrid } from './core/visualize.js';
//# sourceMappingURL=index.d.ts.map