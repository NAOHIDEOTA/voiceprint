import initWasm, { initSync, preprocess as wasmPreprocess } from '../../pkg/voiceprint_wasm.js';
let initialized = false;
let initPromise = null;
/**
 * WASMモジュールを初期化（ブラウザ用・非同期）
 * 通常は自動初期化されるため呼ぶ必要はない
 */
export async function init(wasmUrl) {
    if (initialized)
        return;
    if (initPromise)
        return initPromise;
    initPromise = initWasm(wasmUrl).then(() => {
        initialized = true;
    });
    return initPromise;
}
/**
 * WASMモジュールを初期化（Node.js用・同期）
 */
export function initWithBytes(wasmBytes) {
    if (initialized)
        return;
    initSync({ module: wasmBytes });
    initialized = true;
}
/**
 * 音声前処理 (リサンプル→正規化→VAD→fbank) を WASM で実行
 */
export async function callPreprocess(samples, sampleRate, options) {
    await init();
    return wasmPreprocess(samples, sampleRate, options);
}
//# sourceMappingURL=wasm.js.map