//! voiceprint-wasm: 声紋抽出のための音声前処理 (Rust/WASM)。
//!
//! パイプライン: リサンプリング(→16kHz) → 音量正規化 → VAD → fbank(80次元, CMN)
//! 推論 (ONNX Runtime Web) と判断 (エラー化・しきい値) は TS 側の責務。

mod fbank;
mod resample;
mod vad;

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

const TARGET_RATE: u32 = 16000;
const CLIPPING_LEVEL: f32 = 0.99;
const CLIPPING_RATIO: f32 = 0.001;
/// 可視化用スペクトログラムの最大フレーム数 (時間方向に間引く)
const MAX_SPEC_FRAMES: usize = 400;

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct PreprocessOptions {
    pub vad: Option<bool>,
    pub normalize: Option<bool>,
    pub return_spectrogram: Option<bool>,
    /// CMN (フレーム平均減算)。モデルの feature_normalize_type に合わせる。
    /// default: true (3D-Speaker 系)
    pub cmn: Option<bool>,
    /// 波形の int16 レンジスケール。モデルの normalize_samples=0 なら true。
    /// default: false (3D-Speaker 系)
    pub int16_scale: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreprocessOutput {
    /// fbank 特徴量 (num_frames × num_bins をフラット化、CMN 適用済み)
    pub features: Vec<f32>,
    pub num_frames: usize,
    pub num_bins: usize,
    pub duration_ms: u32,
    pub speech_ms: u32,
    pub clipping: bool,
    /// 入力音声全体の RMS (正規化前)
    pub volume_level: f32,
    /// 発話/非発話の RMS 比から推定した SNR (dB)。推定不能なら None
    pub snr_estimate: Option<f32>,
    /// 可視化用 log-mel スペクトログラム (0..1 正規化、フラット化)
    pub spectrogram: Option<Vec<f32>>,
    pub spectrogram_frames: usize,
    pub spectrogram_bins: usize,
}

/// 音声前処理の本体 (純 Rust。テストからも呼ぶ)
pub fn preprocess_impl(
    samples: &[f32],
    sample_rate: u32,
    options: &PreprocessOptions,
) -> PreprocessOutput {
    let use_vad = options.vad.unwrap_or(true);
    let use_normalize = options.normalize.unwrap_or(true);
    let want_spec = options.return_spectrogram.unwrap_or(false);
    let apply_cmn = options.cmn.unwrap_or(true);
    let int16_scale = options.int16_scale.unwrap_or(false);

    let samples = resample::resample(samples, sample_rate, TARGET_RATE);
    let duration_ms = (samples.len() as u64 * 1000 / TARGET_RATE as u64) as u32;

    // 品質指標は正規化前の原音声から計測する
    let clipped = samples.iter().filter(|v| v.abs() >= CLIPPING_LEVEL).count();
    let clipping = !samples.is_empty()
        && (clipped as f32 / samples.len() as f32) > CLIPPING_RATIO;
    let volume_level = if samples.is_empty() {
        0.0
    } else {
        (samples.iter().map(|v| v * v).sum::<f32>() / samples.len() as f32).sqrt()
    };

    // 音量正規化 (ピーク 0.95) は VAD の絶対しきい値のためだけに使う。
    // fbank へは原スケールの音声を渡す (CMN を適用しないため、正規化ゲインが
    // そのまま特徴量オフセットになり本家 (sherpa-onnx) と乖離するのを防ぐ)。
    let normalized: Vec<f32> = if use_normalize {
        let peak = samples.iter().fold(0.0f32, |m, v| m.max(v.abs()));
        if peak > 1e-6 {
            let gain = 0.95 / peak;
            samples.iter().map(|v| v * gain).collect()
        } else {
            samples.clone()
        }
    } else {
        samples.clone()
    };

    let (speech, speech_ms, snr_estimate) = if use_vad {
        let r = vad::detect(&normalized);
        let snr = match (r.speech_rms, r.noise_rms) {
            (Some(s), Some(n)) if n > 1e-8 => Some(20.0 * (s / n).log10()),
            _ => None,
        };
        // マスクは正規化信号で検出し、サンプルは原スケールから抽出する
        let speech = vad::extract_by_mask(&samples, &r.frame_mask);
        (speech, r.speech_ms, snr)
    } else {
        (samples.clone(), duration_ms, None)
    };

    let (features, num_frames) = fbank::compute(&speech, apply_cmn, int16_scale);

    // 可視化用スペクトログラムは無音も含む全体から生成する
    let (spectrogram, spectrogram_frames, spectrogram_bins) = if want_spec {
        let (spec, frames) = fbank::compute(&normalized, false, false);
        let (spec, frames) = decimate_and_normalize(spec, frames, fbank::NUM_BINS);
        let bins = if frames > 0 { fbank::NUM_BINS } else { 0 };
        (Some(spec), frames, bins)
    } else {
        (None, 0, 0)
    };

    PreprocessOutput {
        features,
        num_frames,
        num_bins: fbank::NUM_BINS,
        duration_ms,
        speech_ms,
        clipping,
        volume_level,
        snr_estimate,
        spectrogram,
        spectrogram_frames,
        spectrogram_bins,
    }
}

/// 時間方向に MAX_SPEC_FRAMES まで間引き、全体を 0..1 に正規化
fn decimate_and_normalize(spec: Vec<f32>, frames: usize, bins: usize) -> (Vec<f32>, usize) {
    if frames == 0 {
        return (vec![], 0);
    }
    let step = frames.div_ceil(MAX_SPEC_FRAMES);
    let out_frames = frames.div_ceil(step);
    let mut out = Vec::with_capacity(out_frames * bins);
    for f in (0..frames).step_by(step) {
        out.extend_from_slice(&spec[f * bins..(f + 1) * bins]);
    }
    let min = out.iter().cloned().fold(f32::INFINITY, f32::min);
    let max = out.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
    let range = (max - min).max(1e-6);
    for v in out.iter_mut() {
        *v = (*v - min) / range;
    }
    (out, out_frames)
}

/// WASM エクスポート: 音声前処理
#[wasm_bindgen]
pub fn preprocess(
    samples: &[f32],
    sample_rate: u32,
    options: JsValue,
) -> Result<JsValue, JsValue> {
    let options: PreprocessOptions = if options.is_undefined() || options.is_null() {
        PreprocessOptions::default()
    } else {
        serde_wasm_bindgen::from_value(options)
            .map_err(|e| JsValue::from_str(&format!("invalid options: {e}")))?
    };
    let out = preprocess_impl(samples, sample_rate, &options);
    serde_wasm_bindgen::to_value(&out).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn speech_like(seconds: usize) -> Vec<f32> {
        // 話声を模した振幅変調トーン
        (0..16000 * seconds)
            .map(|i| {
                let t = i as f32 / 16000.0;
                let env = 0.5 + 0.5 * (2.0 * std::f32::consts::PI * 2.0 * t).sin();
                0.4 * env * (2.0 * std::f32::consts::PI * 180.0 * t).sin()
            })
            .collect()
    }

    #[test]
    fn full_pipeline_produces_features() {
        let samples = speech_like(4);
        let out = preprocess_impl(&samples, 16000, &PreprocessOptions::default());
        assert!(out.num_frames > 100, "num_frames = {}", out.num_frames);
        assert_eq!(out.features.len(), out.num_frames * out.num_bins);
        assert_eq!(out.duration_ms, 4000);
        assert!(out.speech_ms > 2000);
        assert!(!out.clipping);
    }

    #[test]
    fn spectrogram_is_normalized() {
        let samples = speech_like(2);
        let opts = PreprocessOptions {
            return_spectrogram: Some(true),
            ..Default::default()
        };
        let out = preprocess_impl(&samples, 16000, &opts);
        let spec = out.spectrogram.unwrap();
        assert_eq!(spec.len(), out.spectrogram_frames * out.spectrogram_bins);
        let max = spec.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
        let min = spec.iter().cloned().fold(f32::INFINITY, f32::min);
        assert!((max - 1.0).abs() < 1e-5 && min.abs() < 1e-5);
    }

    #[test]
    fn resamples_from_48k() {
        let samples: Vec<f32> = (0..48000 * 2)
            .map(|i| 0.4 * (2.0 * std::f32::consts::PI * 180.0 * i as f32 / 48000.0).sin())
            .collect();
        let out = preprocess_impl(&samples, 48000, &PreprocessOptions::default());
        assert_eq!(out.duration_ms, 2000);
    }

    #[test]
    fn silence_yields_no_speech() {
        let samples = vec![0.0f32; 16000 * 3];
        let out = preprocess_impl(&samples, 16000, &PreprocessOptions::default());
        assert_eq!(out.speech_ms, 0);
        assert_eq!(out.num_frames, 0);
    }

    #[test]
    fn clipping_detected() {
        let samples: Vec<f32> = (0..16000)
            .map(|i| {
                let v = 2.0 * (2.0 * std::f32::consts::PI * 180.0 * i as f32 / 16000.0).sin();
                v.clamp(-1.0, 1.0)
            })
            .collect();
        let out = preprocess_impl(&samples, 16000, &PreprocessOptions::default());
        assert!(out.clipping);
    }
}
