/**
 * speaker embedding ONNX モデルのロードとキャッシュ。
 * 既定では Cache Storage に永続化し、2回目以降は再ダウンロードしない。
 */
import type { InferenceSession } from 'onnxruntime-web';
import type { ModelSize } from '../types.js';

const CACHE_NAME = 'voiceprint-models-v1';

/**
 * 既定の配布先。Hugging Face Hub (3D-Speaker 由来の ONNX, Apache-2.0)。
 * 利用側で modelBaseUrl を渡せば上書き可能。
 *
 * GitHub Releases は使えない。ブラウザからの取得はダウンロード URL が
 * Access-Control-Allow-Origin なしの 302 を返すため CORS で必ず失敗する
 * (リダイレクト先の release-assets.githubusercontent.com も ACAO を返さない)。
 */
export const DEFAULT_MODEL_BASE_URL =
  'https://huggingface.co/sollonao/voiceprint-models/resolve/main';

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

/** 3D-Speaker 系 (normalize_samples=1 / global-mean CMN) の前処理設定 */
const PREPROCESS_3DSPEAKER = { cmn: true, int16Scale: false } as const;

export const MODELS: Record<ModelSize, ModelInfo> = {
  small: {
    file: 'campplus-zhen-int8.onnx',
    dimension: 192,
    approxSizeMb: 8,
    name: 'campplus-zhen-int8',
    preprocess: PREPROCESS_3DSPEAKER,
  },
  base: {
    file: 'campplus-zhen.onnx',
    dimension: 192,
    approxSizeMb: 27,
    name: 'campplus-zhen',
    preprocess: PREPROCESS_3DSPEAKER,
  },
  large: {
    file: 'eres2netv2-zh.onnx',
    dimension: 192,
    approxSizeMb: 69,
    name: 'eres2netv2-zh',
    preprocess: PREPROCESS_3DSPEAKER,
  },
};

export const DEFAULT_MODEL: ModelSize = 'base';

let ortModule: typeof import('onnxruntime-web') | null = null;

export async function loadOrt(): Promise<typeof import('onnxruntime-web')> {
  if (ortModule) return ortModule;
  ortModule = await import('onnxruntime-web');
  return ortModule;
}

async function fetchWithCache(url: string): Promise<ArrayBuffer> {
  if (typeof caches !== 'undefined') {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(url);
    if (hit) return await hit.arrayBuffer();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    const clone = res.clone();
    await cache.put(url, clone);
    return await res.arrayBuffer();
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return await res.arrayBuffer();
}

const sessionCache = new Map<string, Promise<InferenceSession>>();

/**
 * モデルの ONNX セッションを取得 (シングルトンキャッシュ)
 */
export function getSession(size: ModelSize, baseUrl: string): Promise<InferenceSession> {
  const info = MODELS[size];
  const url = `${baseUrl.replace(/\/$/, '')}/${info.file}`;
  let p = sessionCache.get(url);
  if (!p) {
    p = (async () => {
      const ort = await loadOrt();
      const buf = await fetchWithCache(url);
      return await ort.InferenceSession.create(buf, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
    })();
    sessionCache.set(url, p);
  }
  return p;
}

/**
 * モデルを事前ロードする (初回抽出の待ち時間を減らしたい場合に任意で使用)
 */
export async function preloadModel(
  size: ModelSize = DEFAULT_MODEL,
  baseUrl: string = DEFAULT_MODEL_BASE_URL,
): Promise<void> {
  await getSession(size, baseUrl);
}
