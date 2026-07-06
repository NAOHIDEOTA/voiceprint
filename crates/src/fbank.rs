//! kaldi 互換 80次元 log-mel filterbank (fbank) 特徴量抽出。
//!
//! sherpa-onnx (kaldi-native-fbank) の設定に合わせる:
//! - remove_dc_offset / preemphasis 0.97 / povey window
//! - snip_edges=false (中心寄せフレーミング + 端は反射パディング)
//! - 512点 FFT / power spectrum / HTK mel (20Hz〜nyquist-400=7600Hz) / 自然対数
//! - dither 0 (推論用途)
//!
//! 以下2点はモデルの ONNX metadata に依存するため引数で切り替える:
//! - `int16_scale`: normalize_samples=0 のモデル (WeSpeaker 等) は波形を int16
//!   レンジへスケールする。3D-Speaker 系 (normalize_samples=1) はスケールしない。
//! - `apply_cmn`: feature_normalize_type="global-mean" のモデル (3D-Speaker 等) は
//!   フレーム平均減算 (CMN) を適用する。

use rustfft::{num_complex::Complex, FftPlanner};

pub const SAMPLE_RATE: usize = 16000;
pub const NUM_BINS: usize = 80;
pub const FRAME_LEN: usize = 400; // 25ms
pub const FRAME_HOP: usize = 160; // 10ms
const FFT_SIZE: usize = 512;
const PREEMPH: f32 = 0.97;
const LOW_FREQ: f32 = 20.0;
/// sherpa-onnx 既定値 (nyquist - 400 = 7600Hz)
const HIGH_FREQ_OFFSET: f32 = 400.0;
/// normalize_samples=0 のモデル向け: [-1,1] 入力を int16 レンジへスケールする係数
const INT16_SCALE: f32 = 32768.0;

fn hz_to_mel(hz: f32) -> f32 {
    1127.0 * (1.0 + hz / 700.0).ln()
}

/// povey window: hanning^0.85
fn povey_window(len: usize) -> Vec<f32> {
    (0..len)
        .map(|i| {
            let hann =
                0.5 - 0.5 * (2.0 * std::f32::consts::PI * i as f32 / (len - 1) as f32).cos();
            hann.powf(0.85)
        })
        .collect()
}

/// 三角メルフィルタバンク (bins × (FFT_SIZE/2+1))
fn mel_filterbank() -> Vec<Vec<f32>> {
    let nyquist = SAMPLE_RATE as f32 / 2.0;
    let num_fft_bins = FFT_SIZE / 2 + 1;
    let mel_low = hz_to_mel(LOW_FREQ);
    let mel_high = hz_to_mel(nyquist - HIGH_FREQ_OFFSET);
    let mel_step = (mel_high - mel_low) / (NUM_BINS + 1) as f32;
    let fft_bin_width = SAMPLE_RATE as f32 / FFT_SIZE as f32;

    (0..NUM_BINS)
        .map(|b| {
            let left = mel_low + b as f32 * mel_step;
            let center = mel_low + (b + 1) as f32 * mel_step;
            let right = mel_low + (b + 2) as f32 * mel_step;
            (0..num_fft_bins)
                .map(|i| {
                    let mel = hz_to_mel(i as f32 * fft_bin_width);
                    if mel > left && mel < right {
                        if mel <= center {
                            (mel - left) / (center - left)
                        } else {
                            (right - mel) / (right - center)
                        }
                    } else {
                        0.0
                    }
                })
                .collect()
        })
        .collect()
}

/// snip_edges=false の中心寄せフレーミングでフレームを切り出す (kaldi 互換)。
/// 範囲外サンプルは反射パディング。
fn extract_frame(samples: &[f32], frame_index: usize, scale: f32) -> Vec<f32> {
    let n = samples.len() as i64;
    let midpoint = (frame_index * FRAME_HOP + FRAME_HOP / 2) as i64;
    let beg = midpoint - (FRAME_LEN / 2) as i64;
    (0..FRAME_LEN as i64)
        .map(|off| {
            let mut s = beg + off;
            while s < 0 || s >= n {
                s = if s < 0 { -s - 1 } else { 2 * n - 1 - s };
            }
            samples[s as usize] * scale
        })
        .collect()
}

/// fbank 特徴量を計算する。戻り値は (フレーム数 × NUM_BINS) をフラット化した Vec。
pub fn compute(samples: &[f32], apply_cmn: bool, int16_scale: bool) -> (Vec<f32>, usize) {
    // snip_edges=false: num_frames = (num_samples + shift/2) / shift
    let num_frames = (samples.len() + FRAME_HOP / 2) / FRAME_HOP;
    if num_frames == 0 {
        return (vec![], 0);
    }
    let window = povey_window(FRAME_LEN);
    let filters = mel_filterbank();

    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(FFT_SIZE);

    let mut feats = vec![0.0f32; num_frames * NUM_BINS];
    let scale = if int16_scale { INT16_SCALE } else { 1.0 };

    for f in 0..num_frames {
        let mut frame = extract_frame(samples, f, scale);

        // remove DC offset
        let mean = frame.iter().sum::<f32>() / FRAME_LEN as f32;
        for v in frame.iter_mut() {
            *v -= mean;
        }

        // preemphasis (kaldi 同様に逆順で適用、先頭は自分自身を使う)
        for i in (1..FRAME_LEN).rev() {
            frame[i] -= PREEMPH * frame[i - 1];
        }
        frame[0] -= PREEMPH * frame[0];

        // window + zero pad
        let mut buf: Vec<Complex<f32>> = (0..FFT_SIZE)
            .map(|i| {
                if i < FRAME_LEN {
                    Complex::new(frame[i] * window[i], 0.0)
                } else {
                    Complex::new(0.0, 0.0)
                }
            })
            .collect();
        fft.process(&mut buf);

        // power spectrum
        let power: Vec<f32> = buf[..FFT_SIZE / 2 + 1]
            .iter()
            .map(|c| c.norm_sqr())
            .collect();

        // mel filter + 自然対数
        for (b, filter) in filters.iter().enumerate() {
            let energy: f32 = filter
                .iter()
                .zip(&power)
                .map(|(w, p)| w * p)
                .sum::<f32>()
                .max(f32::EPSILON);
            feats[f * NUM_BINS + b] = energy.ln();
        }
    }

    if apply_cmn {
        for b in 0..NUM_BINS {
            let mean: f32 =
                (0..num_frames).map(|f| feats[f * NUM_BINS + b]).sum::<f32>() / num_frames as f32;
            for f in 0..num_frames {
                feats[f * NUM_BINS + b] -= mean;
            }
        }
    }

    (feats, num_frames)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tone(len: usize, freq: f32, amp: f32) -> Vec<f32> {
        (0..len)
            .map(|i| amp * (2.0 * std::f32::consts::PI * freq * i as f32 / 16000.0).sin())
            .collect()
    }

    #[test]
    fn frame_count() {
        let samples = vec![0.01f32; 16000]; // 1秒
        let (feats, frames) = compute(&samples, false, false);
        // snip_edges=false: (16000 + 80) / 160 = 100
        assert_eq!(frames, (16000 + FRAME_HOP / 2) / FRAME_HOP);
        assert_eq!(feats.len(), frames * NUM_BINS);
    }

    #[test]
    fn cmn_makes_zero_mean() {
        let samples = tone(16000, 300.0, 0.5);
        let (feats, frames) = compute(&samples, true, false);
        for b in 0..NUM_BINS {
            let mean: f32 =
                (0..frames).map(|f| feats[f * NUM_BINS + b]).sum::<f32>() / frames as f32;
            assert!(mean.abs() < 1e-3, "bin {b} mean = {mean}");
        }
    }

    #[test]
    fn gain_invariant_after_cmn() {
        // CMN 後はゲイン差が消えること (全 bin にエネルギーが乗る広帯域信号で確認。
        // 純音だとエネルギーほぼゼロの bin が epsilon フロアに当たり不変性が崩れる)
        let mut seed = 7u32;
        let noise: Vec<f32> = (0..16000)
            .map(|_| {
                seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
                (seed >> 16) as f32 / 32768.0 - 1.0
            })
            .collect();
        let a: Vec<f32> = noise.iter().map(|v| v * 0.5).collect();
        let b: Vec<f32> = noise.iter().map(|v| v * 0.05).collect();
        let (fa, _) = compute(&a, true, false);
        let (fb, _) = compute(&b, true, false);
        let max_diff = fa
            .iter()
            .zip(&fb)
            .fold(0.0f32, |m, (x, y)| m.max((x - y).abs()));
        assert!(max_diff < 1e-2, "max_diff = {max_diff}");
    }

    #[test]
    fn tone_energy_lands_in_expected_band() {
        // 1kHz トーンのエネルギー最大 bin が低域・高域端ではないこと
        let samples = tone(16000, 1000.0, 0.5);
        let (feats, frames) = compute(&samples, false, false);
        // 中央フレームの最大 bin
        let f = frames / 2;
        let row = &feats[f * NUM_BINS..(f + 1) * NUM_BINS];
        let max_bin = row
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.partial_cmp(b.1).unwrap())
            .unwrap()
            .0;
        assert!(max_bin > 10 && max_bin < 60, "max_bin = {max_bin}");
    }
}
