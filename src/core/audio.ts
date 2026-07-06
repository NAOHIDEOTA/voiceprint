/**
 * 音声入力 (Blob / ArrayBuffer / Float32Array) のデコードと 16kHz mono 化。
 * ブラウザでは OfflineAudioContext による高品質リサンプリングを使う。
 * Float32Array 入力でレートが異なる場合は WASM 側の簡易リサンプラーに委ねる。
 */

export const TARGET_SAMPLE_RATE = 16000;

export type DecodedAudio = {
  samples: Float32Array;
  sampleRate: number;
};

/**
 * 入力を Float32Array (mono) にデコードする。
 * Blob / ArrayBuffer はブラウザの decodeAudioData で 16kHz mono に変換して返す。
 */
export async function decodeAudio(
  audio: Blob | ArrayBuffer | Float32Array,
  inputSampleRate: number,
): Promise<DecodedAudio> {
  if (audio instanceof Float32Array) {
    return { samples: audio, sampleRate: inputSampleRate };
  }

  const buf = audio instanceof Blob ? await audio.arrayBuffer() : audio;

  if (typeof AudioContext === 'undefined' && typeof OfflineAudioContext === 'undefined') {
    throw new DecodeError('Web Audio API is not available in this environment');
  }

  // decodeAudioData はレート情報を持つコンテナ (wav/webm/mp3等) を想定
  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(buf.slice(0));
  } finally {
    await ctx.close();
  }

  // OfflineAudioContext で 16kHz mono へレンダリング (高品質リサンプル)
  const targetLength = Math.ceil((decoded.duration || 0) * TARGET_SAMPLE_RATE);
  if (targetLength === 0) {
    return { samples: new Float32Array(0), sampleRate: TARGET_SAMPLE_RATE };
  }
  const offline = new OfflineAudioContext(1, targetLength, TARGET_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return {
    samples: rendered.getChannelData(0).slice(),
    sampleRate: TARGET_SAMPLE_RATE,
  };
}

export class DecodeError extends Error {}
