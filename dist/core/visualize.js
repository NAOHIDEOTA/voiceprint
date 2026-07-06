/**
 * voiceprint vector をヒートマップ表示用の2次元配列 (0..1 正規化) に変換する。
 * 人間が見て一致判定するためのものではない (説明用)。
 */
export function voiceprintToHeatmap(voiceprint, options) {
    const cols = options?.cols ?? 16;
    const normalize = options?.normalize ?? true;
    return vectorToGrid(voiceprint.vector, cols, normalize);
}
/** フラットなベクトルを rows × cols のグリッドに変換 */
export function vectorToGrid(vector, cols = 16, normalize = true) {
    if (!Number.isInteger(cols) || cols <= 0) {
        throw new Error(`cols must be a positive integer: ${cols}`);
    }
    const arr = Array.from(vector);
    const rows = Math.ceil(arr.length / cols);
    let min = 0;
    let max = 1;
    if (normalize && arr.length > 0) {
        min = Math.min(...arr);
        max = Math.max(...arr);
    }
    const range = max - min || 1;
    return Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (_, col) => {
        const i = row * cols + col;
        const value = arr[i] ?? min;
        return normalize ? (value - min) / range : value;
    }));
}
/**
 * WASM から返ったフラットなスペクトログラムを number[][] (時間 × 周波数) に変換
 */
export function spectrogramToGrid(flat, frames, bins) {
    if (!Number.isInteger(frames) || frames < 0) {
        throw new Error(`frames must be a non-negative integer: ${frames}`);
    }
    if (!Number.isInteger(bins) || bins <= 0) {
        throw new Error(`bins must be a positive integer: ${bins}`);
    }
    if (flat.length !== frames * bins) {
        throw new Error(`spectrogram shape mismatch: ${flat.length} values for ${frames}x${bins}`);
    }
    const grid = [];
    for (let f = 0; f < frames; f++) {
        grid.push(flat.slice(f * bins, (f + 1) * bins));
    }
    return grid;
}
//# sourceMappingURL=visualize.js.map