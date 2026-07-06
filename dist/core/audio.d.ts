/**
 * 音声入力 (Blob / ArrayBuffer / Float32Array) のデコードと 16kHz mono 化。
 * ブラウザでは OfflineAudioContext による高品質リサンプリングを使う。
 * Float32Array 入力でレートが異なる場合は WASM 側の簡易リサンプラーに委ねる。
 */
export declare const TARGET_SAMPLE_RATE = 16000;
export type DecodedAudio = {
    samples: Float32Array;
    sampleRate: number;
};
/**
 * 入力を Float32Array (mono) にデコードする。
 * Blob / ArrayBuffer はブラウザの decodeAudioData で 16kHz mono に変換して返す。
 */
export declare function decodeAudio(audio: Blob | ArrayBuffer | Float32Array, inputSampleRate: number): Promise<DecodedAudio>;
export declare class DecodeError extends Error {
}
//# sourceMappingURL=audio.d.ts.map