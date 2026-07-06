import { decodeAudio, DecodeError, TARGET_SAMPLE_RATE } from './audio.js';
import { callPreprocess } from './wasm.js';
import { DEFAULT_MODEL, DEFAULT_MODEL_BASE_URL, getSession, loadOrt, MODELS } from './models.js';
import { spectrogramToGrid, vectorToGrid } from './visualize.js';
import { l2Normalize } from './vector.js';
/** voiceprint フォーマットのバージョン */
export const VOICEPRINT_VERSION = '1';
const DEFAULT_MIN_SPEECH_MS = 3000;
const RECOMMENDED_SPEECH_MS = 5000;
function fail(code, message, details) {
    return { ok: false, code, message, details };
}
/**
 * 音声から voiceprint を抽出する
 */
export async function extractVoiceprint(audio, options = {}) {
    const { sampleRate = TARGET_SAMPLE_RATE, minSpeechMs = DEFAULT_MIN_SPEECH_MS, normalize = true, vad = true, returnSpectrogram = false, model = DEFAULT_MODEL, modelBaseUrl = DEFAULT_MODEL_BASE_URL, } = options;
    // 1. デコード (→ Float32Array mono)
    let samples;
    let inputRate;
    try {
        const decoded = await decodeAudio(audio, sampleRate);
        samples = decoded.samples;
        inputRate = decoded.sampleRate;
    }
    catch (e) {
        if (e instanceof DecodeError) {
            return fail('UNSUPPORTED_BROWSER', e.message, e);
        }
        return fail('AUDIO_DECODE_FAILED', `failed to decode audio: ${String(e)}`, e);
    }
    if (samples.length === 0) {
        return fail('AUDIO_DECODE_FAILED', 'decoded audio is empty');
    }
    // 2. WASM 前処理 (fbank の CMN / スケールはモデル定義に従う)
    const info = MODELS[model];
    const pre = await callPreprocess(samples, inputRate, {
        vad,
        normalize,
        returnSpectrogram,
        cmn: info.preprocess.cmn,
        int16Scale: info.preprocess.int16Scale,
    });
    // 3. 発話量の判断 (Rust は数値を返すのみ、判断はここで行う)
    if (pre.speechMs === 0 || pre.numFrames === 0) {
        return fail('NO_SPEECH_DETECTED', 'no speech detected in the audio');
    }
    if (pre.speechMs < minSpeechMs) {
        return fail('SPEECH_TOO_SHORT', `detected speech is too short: ${pre.speechMs}ms < ${minSpeechMs}ms`, { speechMs: pre.speechMs, minSpeechMs });
    }
    // 4. ONNX 推論
    let vector;
    try {
        const session = await getSession(model, modelBaseUrl);
        const ort = await loadOrt();
        const feats = new ort.Tensor('float32', Float32Array.from(pre.features), [
            1,
            pre.numFrames,
            pre.numBins,
        ]);
        let outputs;
        try {
            outputs = await session.run({ [session.inputNames[0]]: feats });
        }
        catch (e) {
            return fail('INFERENCE_FAILED', `model inference failed: ${String(e)}`, e);
        }
        const emb = outputs[session.outputNames[0]];
        vector = emb.data;
    }
    catch (e) {
        return fail('MODEL_LOAD_FAILED', `failed to load model '${model}': ${String(e)}`, e);
    }
    // 5. L2 正規化
    const normalized = l2Normalize(vector);
    // 6. 品質情報
    const warnings = [];
    if (pre.clipping)
        warnings.push('audio contains clipping');
    if (pre.speechMs < RECOMMENDED_SPEECH_MS) {
        warnings.push(`speech is shorter than recommended ${RECOMMENDED_SPEECH_MS}ms`);
    }
    if (pre.snrEstimate !== null && pre.snrEstimate < 10) {
        warnings.push('low estimated SNR (noisy recording)');
    }
    const quality = {
        speechMs: pre.speechMs,
        durationMs: pre.durationMs,
        clipping: pre.clipping,
        volumeLevel: pre.volumeLevel,
        snrEstimate: pre.snrEstimate ?? undefined,
        warnings,
    };
    // 7. 可視化
    let visualization;
    if (returnSpectrogram) {
        visualization = {
            spectrogram: pre.spectrogram
                ? spectrogramToGrid(pre.spectrogram, pre.spectrogramFrames, pre.spectrogramBins)
                : undefined,
            vectorHeatmap: vectorToGrid(normalized, 16, true),
        };
    }
    return {
        ok: true,
        voiceprint: {
            version: VOICEPRINT_VERSION,
            model: info.name,
            dimension: normalized.length,
            vector: normalized,
            norm: 'l2',
            sampleRate: TARGET_SAMPLE_RATE,
            durationMs: pre.durationMs,
            speechMs: pre.speechMs,
        },
        quality,
        visualization,
    };
}
//# sourceMappingURL=extract.js.map