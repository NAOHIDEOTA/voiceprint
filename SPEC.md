# Voiceprint WASM SDK / GitHub Pages Demo 仕様書

## 1. 概要

本仕様書は、サーバーを使わず、GitHub Pages 上で提供できる完全クライアントサイドの声紋抽出・比較 SDK およびデモアプリの仕様を定義する。

本プロジェクトは、音声から話者識別向けの声紋パターンを抽出し、声紋同士の類似度比較を行うための Web SDK を提供することを目的とする。

本システムはユーザーの声紋データをサーバーに保存しない。音声処理、声紋ベクトル抽出、比較、可視化はすべてブラウザ上で実行する。

## 2. 前提

- GitHub Pages 上でホスティングする
- サーバー API は使用しない
- 処理はすべてブラウザ内で完結する
- 音声データおよび声紋データは外部送信しない
- 生成 AI は使用しない
- 使用するのは speaker embedding モデルである
- SDK 利用者が声紋の保存、ユーザー管理、最終的な一致判定責任を持つ

## 3. 用語定義

| 用語 | 意味 |
|---|---|
| voiceprint | 音声から抽出された話者特徴ベクトル |
| speaker embedding | 話者の特徴を表す固定長ベクトル |
| embedding model | 音声を speaker embedding に変換するモデル |
| similarity score | 2つの声紋ベクトルの類似度 |
| threshold | 同一話者と判定するためのしきい値 |
| VAD | Voice Activity Detection。発話区間検出 |
| spectrogram | 音声の時間・周波数・強度を表す可視化データ |

## 4. システム構成

```text
GitHub Pages
  ↓
Browser
  ↓
Web Audio API / AudioWorklet
  ↓
Rust/WASM preprocessing
  ↓
ONNX Runtime Web WASM
  ↓
Speaker embedding model
  ↓
Voiceprint vector
  ↓
Compare / Visualize
```

## 5. 技術スタック

| 領域 | 技術候補 |
|---|---|
| UI | TypeScript / React / Vite |
| ホスティング | GitHub Pages |
| 録音 | Web Audio API / MediaRecorder / AudioWorklet |
| 音声前処理 | Rust + wasm-pack |
| 推論 | ONNX Runtime Web WASM |
| モデル形式 | ONNX / ORT format |
| 保存 | IndexedDB / OPFS |
| 可視化 | Canvas / SVG / WebGL optional |
| パッケージ配布 | npm package / ESM bundle |

## 6. 主要機能

### 6.1 声紋抽出

音声入力を受け取り、話者識別向けの固定長ベクトルを返す。

```text
Audio input
  ↓
Resample to 16kHz mono
  ↓
VAD
  ↓
Normalize
  ↓
Speaker embedding model
  ↓
L2 normalized voiceprint vector
```

### 6.2 声紋比較

2つの voiceprint を比較し、cosine similarity を返す。

```text
voiceprint A
voiceprint B
  ↓
cosine similarity
  ↓
score
```

### 6.3 一致判定

類似度スコアと threshold を用いて、同一話者の可能性を判定する。

```text
score >= threshold → same speaker likely
score < threshold  → different speaker / unknown
```

### 6.4 可視化

デモ用途として以下の可視化を提供する。

- 音声スペクトログラム
- 声紋ベクトルヒートマップ
- 類似度スコア表示
- threshold 判定表示

## 7. SDK API 仕様

### 7.1 `extractVoiceprint`

音声から voiceprint を抽出する。

```ts
async function extractVoiceprint(
  audio: Blob | ArrayBuffer | Float32Array,
  options?: ExtractOptions
): Promise<VoiceprintResult>;
```

#### ExtractOptions

```ts
type ExtractOptions = {
  sampleRate?: number;      // default: 16000
  minSpeechMs?: number;     // default: 3000
  normalize?: boolean;      // default: true
  vad?: boolean;            // default: true
  returnSpectrogram?: boolean;
};
```

#### VoiceprintResult

```ts
type VoiceprintResult = {
  ok: true;
  voiceprint: Voiceprint;
  quality: VoiceQuality;
  visualization?: VoiceVisualization;
};
```

#### Voiceprint

```ts
type Voiceprint = {
  version: string;
  model: string;
  dimension: number;
  vector: Float32Array;
  norm: "l2";
  sampleRate: number;
  durationMs: number;
  speechMs: number;
};
```

#### VoiceQuality

```ts
type VoiceQuality = {
  speechMs: number;
  durationMs: number;
  clipping: boolean;
  volumeLevel?: number;
  snrEstimate?: number;
  warnings: string[];
};
```

#### VoiceVisualization

```ts
type VoiceVisualization = {
  spectrogram?: number[][];
  vectorHeatmap?: number[][];
};
```

### 7.2 `compareVoiceprints`

2つの voiceprint を比較する。

```ts
function compareVoiceprints(
  a: Voiceprint,
  b: Voiceprint,
  options?: CompareOptions
): CompareResult;
```

#### CompareOptions

```ts
type CompareOptions = {
  threshold?: number;
  mode?: "loose" | "normal" | "strict";
};
```

#### CompareResult

```ts
type CompareResult = {
  score: number;
  threshold: number;
  sameSpeaker: boolean;
  confidence: "low" | "medium" | "high";
};
```

### 7.3 `isSameSpeaker`

同一話者かどうかを boolean で返す簡易関数。

```ts
function isSameSpeaker(
  a: Voiceprint,
  b: Voiceprint,
  options?: CompareOptions
): boolean;
```

### 7.4 `mergeVoiceprints`

複数の voiceprint を平均化し、登録用の代表 voiceprint を作成する。

```ts
function mergeVoiceprints(
  voiceprints: Voiceprint[]
): Voiceprint;
```

### 7.5 `rankVoiceprints`

1つの query voiceprint と複数候補を比較し、スコア順に返す。

```ts
function rankVoiceprints(
  query: Voiceprint,
  candidates: Voiceprint[]
): Array<{
  index: number;
  score: number;
  sameSpeaker: boolean;
}>;
```

### 7.6 `voiceprintToHeatmap`

voiceprint vector をヒートマップ表示用の2次元配列に変換する。

```ts
function voiceprintToHeatmap(
  voiceprint: Voiceprint,
  options?: {
    cols?: number;
    normalize?: boolean;
  }
): number[][];
```

## 8. 比較アルゴリズム

基本の比較には cosine similarity を使用する。

```ts
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

voiceprint は L2 正規化済みで返すことを推奨する。これにより、比較時の扱いが安定する。

## 9. 推奨 threshold

threshold はモデル、録音環境、用途によって変わるため、固定値を絶対視しない。

初期値の目安は以下とする。

| mode | threshold 目安 | 用途 |
|---|---:|---|
| loose | 0.65〜0.70 | デモ、低リスク用途 |
| normal | 0.70〜0.78 | 一般的な話者比較 |
| strict | 0.78〜0.85 | 誤一致を減らしたい用途 |

SDK はデフォルト threshold を提供するが、開発者が調整可能にする。

## 10. 可視化仕様

### 10.1 スペクトログラム

スペクトログラムは音声由来の可視化であり、一般的に「声紋グラフ」として見られる表示に近い。

```text
音声波形
  ↓
STFT / Mel spectrogram
  ↓
時間 × 周波数 × 強度のグラフ
```

スペクトログラム生成には元の音声データが必要である。voiceprint vector のみからスペクトログラムを復元することはできない。

### 10.2 ベクトルヒートマップ

voiceprint vector の値を2次元グリッドに並べ、声紋パターン風に可視化する。

例：

| dimension | layout |
|---:|---|
| 192 | 16 × 12 |
| 256 | 16 × 16 |
| 512 | 32 × 16 |

```ts
function vectorToGrid(vector: number[], cols = 16): number[][] {
  const rows = Math.ceil(vector.length / cols);
  const min = Math.min(...vector);
  const max = Math.max(...vector);

  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => {
      const i = row * cols + col;
      const value = vector[i] ?? 0;
      return (value - min) / (max - min || 1);
    })
  );
}
```

注意点として、ベクトルヒートマップは人間が見て同一話者かどうかを判断するためのものではない。実際の比較は similarity score によって行う。

## 11. GitHub Pages デモ仕様

### 11.1 画面構成

```text
[Record A]
  ↓
Voiceprint A
  ↓
Spectrogram A
  ↓
Vector Heatmap A

[Record B]
  ↓
Voiceprint B
  ↓
Spectrogram B
  ↓
Vector Heatmap B

[Compare]
  ↓
Similarity Score
  ↓
Same Speaker / Different Speaker
```

### 11.2 デモ機能

- マイク録音
- WAV / audio file upload
- voiceprint 抽出
- voiceprint JSON 表示
- voiceprint ダウンロード
- voiceprint インポート
- voiceprint 比較
- スペクトログラム表示
- ベクトルヒートマップ表示
- threshold スライダー
- 判定結果表示

### 11.3 デモ上の注意表示

デモ画面には以下の注意文を表示する。

```text
このデモはブラウザ内で音声処理を行います。音声データおよび声紋データは外部サーバーへ送信されません。
```

```text
声紋ベクトルの可視化は説明用であり、人間が見て本人一致を判断するためのものではありません。実際の比較には similarity score を使用してください。
```

```text
声紋認証をログイン、決済、重要操作の単独認証に使うことは推奨されません。
```

## 12. モデル仕様

### 12.1 モデルの役割

speaker embedding モデルは、音声から話者特徴を表す固定長ベクトルを抽出する。

```text
音声
  ↓
speaker embedding model
  ↓
voiceprint vector
```

### 12.2 モデルサイズ目安

| 構成 | サイズ目安 |
|---|---:|
| Rust/WASM 前処理 | 100KB〜1MB |
| VAD | 300KB〜数MB |
| ONNX Runtime Web WASM | 数MB〜十数MB |
| 小型 speaker model | 5MB〜20MB |
| 中量級 speaker model | 15MB〜40MB |
| 重量級 speaker model | 40MB〜100MB+ |

GitHub Pages デモでは、初期ロード速度を考慮し、15MB〜40MB程度の中量級モデルを第一候補とする。

### 12.3 モデル選定方針

重たいモデルほど精度は上がりやすいが、単純に「重い = 高精度」とは限らない。

精度に影響する要素は以下である。

1. 学習済みモデルの質
2. 入力音声の長さ
3. ノイズ除去・VAD
4. threshold 設計
5. 複数サンプル平均化
6. モデルサイズ

MVP では中量級モデルを採用し、必要に応じて高精度モデルを追加提供する。

## 13. 音声入力仕様

| 項目 | 推奨値 |
|---|---|
| sample rate | 16kHz |
| channel | mono |
| format | WAV / PCM / Float32Array |
| minimum speech | 3秒以上 |
| recommended speech | 5〜10秒 |
| clipping | 可能な限り回避 |
| background noise | 可能な限り低減 |

## 14. 精度向上方針

精度向上のため、以下を実施する。

- 発話区間を3秒以上確保する
- 可能であれば5〜10秒の音声を推奨する
- VADで無音部分を除去する
- 音量を正規化する
- 16kHz mono に統一する
- 複数 voiceprint の平均化に対応する
- L2正規化済みベクトルを返す
- threshold を調整可能にする
- quality warnings を返す

## 15. エラー仕様

### 15.1 エラー型

```ts
type VoiceprintError = {
  ok: false;
  code: VoiceprintErrorCode;
  message: string;
  details?: unknown;
};
```

### 15.2 エラーコード

```ts
type VoiceprintErrorCode =
  | "AUDIO_DECODE_FAILED"
  | "NO_SPEECH_DETECTED"
  | "SPEECH_TOO_SHORT"
  | "MODEL_LOAD_FAILED"
  | "INFERENCE_FAILED"
  | "UNSUPPORTED_BROWSER"
  | "MIC_PERMISSION_DENIED";
```

## 16. セキュリティ・プライバシー

### 16.1 基本方針

- 音声データを外部送信しない
- voiceprint をSDK側で保存しない
- 保存が必要な場合は利用者側が明示的に行う
- voiceprint は個人識別に使える可能性があるため、個人情報として扱う
- GitHub Pages デモでは、処理がローカル完結であることを明記する

### 16.2 ローカル保存時の注意

利用者が IndexedDB 等に voiceprint を保存する場合、以下を推奨する。

- 保存目的を明示する
- 削除機能を提供する
- 生音声は保存しない、または保存期間を短くする
- voiceprint export/import 時に注意喚起を行う

### 16.3 認証用途での注意

声紋は録音再生、合成音声、AI音声クローン等の攻撃を受ける可能性がある。

そのため、ログイン、決済、重要操作において声紋を単独認証として使用することは推奨しない。

## 17. パフォーマンス目標

| 項目 | 目標 |
|---|---:|
| 初期ロード | 10MB〜40MB程度を目標 |
| 録音処理 | リアルタイム録音可能 |
| voiceprint抽出 | PCで数秒以内 |
| 比較処理 | ほぼ即時 |
| 候補比較数 | 100〜1,000件程度はクライアントで処理可能 |

## 18. MVP スコープ

MVP では以下を実装対象とする。

- GitHub Pages デモ
- マイク録音
- 音声ファイルアップロード
- voiceprint 抽出
- 2つの voiceprint 比較
- similarity score 表示
- threshold スライダー
- スペクトログラム表示
- ベクトルヒートマップ表示
- voiceprint JSON export/import

MVP では以下は対象外とする。

- ユーザーアカウント管理
- サーバー保存
- クラウド同期
- 本人認証フロー
- 決済・ログイン向けの認証保証

## 19. 将来拡張

- 高精度モデルモード
- 軽量モデルモード
- WebGPU backend 対応
- 複数 voiceprint の登録・平均化 UI
- Top-K 話者ランキング
- しきい値自動キャリブレーション
- 録音再生攻撃検知
- 合成音声検知
- PWA対応
- npm SDKとして配布

## 20. 推奨パッケージ構成

```text
voiceprint-wasm/
  packages/
    core/
      src/
        extract.ts
        compare.ts
        visualize.ts
        quality.ts
    wasm/
      src/
        lib.rs
    demo/
      src/
        App.tsx
        components/
          Recorder.tsx
          Spectrogram.tsx
          VectorHeatmap.tsx
          ComparePanel.tsx
  models/
    speaker-embedding-small.onnx
  docs/
    index.html
  README.md
```

## 21. README 用サンプル

```ts
import {
  extractVoiceprint,
  compareVoiceprints,
  isSameSpeaker
} from "voiceprint-wasm";

const a = await extractVoiceprint(audioBlobA);
const b = await extractVoiceprint(audioBlobB);

const result = compareVoiceprints(a.voiceprint, b.voiceprint, {
  mode: "normal"
});

console.log(result.score);
console.log(result.sameSpeaker);

if (isSameSpeaker(a.voiceprint, b.voiceprint)) {
  console.log("same speaker likely");
}
```

## 22. まとめ

本プロジェクトは、完全クライアントサイドで動作する voiceprint extraction SDK および GitHub Pages デモを提供する。

API側はユーザー情報や声紋を保存せず、音声から voiceprint vector を抽出し、比較・可視化する機能を提供する。

GitHub Pages デモでは、スペクトログラム、ベクトルヒートマップ、similarity score を組み合わせることで、開発者が声紋抽出と比較の仕組みを理解しやすくする。
