# voiceprint

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**Rust/WASM + ONNX Runtime Web** による、完全クライアントサイドの声紋 (speaker embedding) 抽出・比較 SDK。

サーバーを使わず、**ブラウザ内で** 音声から話者特徴ベクトル (voiceprint) を抽出し、cosine similarity による話者比較を行います。音声データ・声紋データは外部に送信されません。

**[Live Demo](https://naohideota.github.io/voiceprint/docs/)**

## Features

- **ブラウザ完結** — 録音・前処理・推論・比較・可視化のすべてがクライアントサイド
- **Rust/WASM 前処理** — リサンプリング / エネルギーベース VAD / kaldi 互換 fbank (sherpa-onnx と数値一致)
- **モデル3段階** — small (int8 量子化 約8MB) / base (約27MB) / large (約69MB) を用途に応じて選択
- **比較 API** — cosine similarity / しきい値判定 / 複数声紋の平均化 / Top-K ランキング
- **可視化** — スペクトログラム・声紋ベクトルヒートマップ
- **品質情報** — 発話時間 / クリッピング検出 / SNR 推定 / warnings
- **TypeScript** — 完全な型定義付き。結果は判別可能 union (`ok: true | false`)

## Models

[3D-Speaker](https://github.com/modelscope/3D-Speaker) (Apache-2.0) 由来の ONNX モデルを GitHub Releases から取得し、Cache Storage にキャッシュします (2回目以降は再ダウンロードなし)。

| size | モデル | サイズ | 次元 | 特徴 |
|---|---|---:|---:|---|
| `small` | CAM++ zh/en (int8 静的量子化) | 約8MB | 192 | 最速ロード。精度低下はごく僅か |
| `base` | CAM++ zh/en バイリンガル (既定) | 約27MB | 192 | 速度と精度のバランス |
| `large` | ERes2NetV2 | 約69MB | 192 | 最も重いが頑健 |

> 特徴量抽出 (fbank) は本家 sherpa-onnx と **cosine = 1.0** で一致することを検証済み。

## Installation

```bash
npm install voiceprint
```

## Quick Start

```ts
import {
  extractVoiceprint,
  compareVoiceprints,
  isSameSpeaker,
} from 'voiceprint';

const a = await extractVoiceprint(audioBlobA);          // Blob | ArrayBuffer | Float32Array
const b = await extractVoiceprint(audioBlobB, { model: 'small' });

if (a.ok && b.ok) {
  const result = compareVoiceprints(a.voiceprint, b.voiceprint, { mode: 'normal' });
  console.log(result.score);        // cosine similarity
  console.log(result.sameSpeaker);  // boolean
  console.log(result.confidence);   // 'low' | 'medium' | 'high'

  if (isSameSpeaker(a.voiceprint, b.voiceprint)) {
    console.log('same speaker likely');
  }
} else {
  // ok: false の場合は code で分岐 (SPEECH_TOO_SHORT / NO_SPEECH_DETECTED など)
  console.error(a.ok ? b : a);
}
```

### 抽出オプション

```ts
const result = await extractVoiceprint(audio, {
  model: 'base',            // 'small' | 'base' | 'large'
  sampleRate: 16000,        // Float32Array 入力時のサンプルレート
  minSpeechMs: 3000,        // 必要最低発話時間 (推奨 5〜10 秒)
  vad: true,                // 発話区間検出 (既定 ON)
  normalize: true,          // 音量正規化 (既定 ON)
  returnSpectrogram: true,  // 可視化データを含める
  modelBaseUrl: '...',      // モデル配布先の上書き (セルフホスト用)
});
```

### その他の API

```ts
import {
  mergeVoiceprints,     // 複数声紋の平均化 (登録用の代表声紋を作成)
  rankVoiceprints,      // query と候補一覧をスコア順に
  voiceprintToJson,     // JSON export (vector を number[] に)
  voiceprintFromJson,   // JSON import
  voiceprintToHeatmap,  // ヒートマップ用 2 次元配列
  preloadModel,         // モデルの事前ロード
  THRESHOLDS,           // mode ごとの既定しきい値
} from 'voiceprint';
```

## しきい値について

同梱モデルでは **別話者スコアはほぼ 0 付近、同一話者は 0.6〜0.8** に分布します。既定値は `loose: 0.35` / `normal: 0.45` / `strict: 0.55` です。

しきい値はモデル・録音環境・用途に依存します。固定値を絶対視せず、実際のデータで調整してください (`threshold` オプションで直接指定可能)。

## セキュリティ・プライバシー

- 音声・声紋データを外部送信しません。SDK 側で保存もしません
- voiceprint は個人識別に使える可能性があるため、保存する場合は個人情報として扱ってください
- 声紋は録音再生・合成音声等の攻撃を受ける可能性があります。**ログイン・決済・重要操作の単独認証としての使用は推奨しません**

## Development

```bash
make up      # Docker コンテナ起動 (Rust + Node)
make build   # wasm-pack + tsc ビルド
make models  # ONNX モデル取得 + int8 量子化 (models/ へ)
make test    # Rust テスト + Node テスト
make demo    # http://localhost:8081/docs/ でデモ起動
```

- ローカルデモは `models/` を直接参照します (`make models` が必要)
- 実モデルの推論テスト: `docker exec voiceprint node tests/inference.mjs [small|base|large]`

### モデルの配布 (メンテナ向け)

生成した `models/*.onnx` を GitHub Releases (tag: `models-v1`) にアップロードします:

```bash
make release-models
```

## Architecture

```
Audio (Blob / ArrayBuffer / Float32Array)
  ↓ decodeAudio (Web Audio API, 16kHz mono 化)
Rust/WASM preprocess
  ↓ resample → normalize → VAD → fbank 80次元
ONNX Runtime Web (wasm)
  ↓ speaker embedding model
L2 normalized voiceprint vector
  ↓
compare / merge / rank / visualize
```

## License

MIT (SDK 本体) / モデルは [3D-Speaker](https://github.com/modelscope/3D-Speaker) 由来 (Apache-2.0)、配布物は [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) の変換済み ONNX を基にしています。
