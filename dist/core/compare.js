import { assertSameLength, assertVectorLength, l2Normalize } from './vector.js';
/**
 * mode ごとのデフォルトしきい値。
 * 同梱の 3D-Speaker (CAM++/ERes2NetV2) 系モデルの実測分布に合わせた値
 * (別話者スコアは概ね 0 付近、同一話者は 0.6〜0.8 に分布する)。
 * しきい値はモデル・録音環境・用途に依存するため固定値を絶対視しないこと。
 */
export const THRESHOLDS = {
    loose: 0.35,
    normal: 0.45,
    strict: 0.55,
};
function assertSameModel(a, b, action) {
    if (a.model !== b.model) {
        throw new Error(`cannot ${action} voiceprints from different models: ${a.model} vs ${b.model}`);
    }
}
function assertCompatibleVoiceprints(a, b, action) {
    assertSameModel(a, b, action);
    assertVectorLength(a.vector, a.dimension, 'voiceprint');
    assertVectorLength(b.vector, b.dimension, 'voiceprint');
    if (a.dimension !== b.dimension) {
        throw new Error(`cannot ${action} voiceprints with different dimensions: ${a.dimension} vs ${b.dimension}`);
    }
}
/** cosine similarity */
export function cosineSimilarity(a, b) {
    assertSameLength(a, b);
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 0 ? dot / denom : 0;
}
function resolveThreshold(options) {
    if (options?.threshold !== undefined)
        return options.threshold;
    return THRESHOLDS[options?.mode ?? 'normal'];
}
/**
 * 2つの voiceprint を比較する。
 * 異なるモデル・次元の voiceprint 同士は比較できない (throw)。
 */
export function compareVoiceprints(a, b, options) {
    assertCompatibleVoiceprints(a, b, 'compare');
    const score = cosineSimilarity(a.vector, b.vector);
    const threshold = resolveThreshold(options);
    const sameSpeaker = score >= threshold;
    // しきい値からの距離で confidence を決める
    const margin = Math.abs(score - threshold);
    const confidence = margin >= 0.1 ? 'high' : margin >= 0.04 ? 'medium' : 'low';
    return { score, threshold, sameSpeaker, confidence };
}
/** 同一話者かどうかの簡易判定 */
export function isSameSpeaker(a, b, options) {
    return compareVoiceprints(a, b, options).sameSpeaker;
}
/**
 * 複数 voiceprint を平均化し、登録用の代表 voiceprint を作成する (L2 再正規化)
 */
export function mergeVoiceprints(voiceprints) {
    if (voiceprints.length === 0) {
        throw new Error('mergeVoiceprints requires at least one voiceprint');
    }
    const first = voiceprints[0];
    for (const vp of voiceprints) {
        assertCompatibleVoiceprints(first, vp, 'merge');
    }
    const dim = first.dimension;
    const mean = new Float32Array(dim);
    for (const vp of voiceprints) {
        for (let i = 0; i < dim; i++)
            mean[i] += vp.vector[i];
    }
    for (let i = 0; i < dim; i++)
        mean[i] /= voiceprints.length;
    return {
        ...first,
        vector: l2Normalize(mean),
        durationMs: voiceprints.reduce((s, v) => s + v.durationMs, 0),
        speechMs: voiceprints.reduce((s, v) => s + v.speechMs, 0),
    };
}
/**
 * query と複数候補を比較し、スコア降順に返す
 */
export function rankVoiceprints(query, candidates, options) {
    const threshold = resolveThreshold(options);
    return candidates
        .map((c, index) => {
        assertCompatibleVoiceprints(query, c, 'rank');
        const score = cosineSimilarity(query.vector, c.vector);
        return { index, score, sameSpeaker: score >= threshold };
    })
        .sort((a, b) => b.score - a.score);
}
/** voiceprint を JSON 化可能なオブジェクトへ変換 */
export function voiceprintToJson(vp) {
    return { ...vp, vector: Array.from(vp.vector) };
}
/** JSON からの復元 */
export function voiceprintFromJson(json) {
    if (!Array.isArray(json.vector) || json.vector.length !== json.dimension) {
        throw new Error('invalid voiceprint json: vector length does not match dimension');
    }
    const vector = new Float32Array(json.vector);
    assertVectorLength(vector, json.dimension, 'voiceprint json');
    return { ...json, vector };
}
//# sourceMappingURL=compare.js.map