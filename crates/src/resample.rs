//! 任意サンプルレート → 16kHz mono へのリサンプリング。
//!
//! ブラウザ経路では TS 側が OfflineAudioContext で高品質リサンプルを行うため、
//! ここは Float32Array 直接入力 (Node.js テスト等) 向けのフォールバック実装。
//! ダウンサンプリング時のエイリアシングを抑えるため移動平均の簡易ローパスを併用する。

/// 線形補間リサンプリング (簡易ローパス付き)
pub fn resample(samples: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    if from_rate == to_rate || samples.is_empty() {
        return samples.to_vec();
    }

    // ダウンサンプリング時は比率に応じた移動平均でエイリアシングを軽減
    let filtered: Vec<f32> = if from_rate > to_rate {
        let ratio = (from_rate as f32 / to_rate as f32).ceil() as usize;
        let half = ratio / 2;
        if half == 0 {
            samples.to_vec()
        } else {
            (0..samples.len())
                .map(|i| {
                    let lo = i.saturating_sub(half);
                    let hi = (i + half + 1).min(samples.len());
                    let sum: f32 = samples[lo..hi].iter().sum();
                    sum / (hi - lo) as f32
                })
                .collect()
        }
    } else {
        samples.to_vec()
    };

    let out_len = ((samples.len() as u64 * to_rate as u64) / from_rate as u64) as usize;
    let step = from_rate as f64 / to_rate as f64;
    (0..out_len)
        .map(|i| {
            let pos = i as f64 * step;
            let idx = pos as usize;
            let frac = (pos - idx as f64) as f32;
            let a = filtered[idx.min(filtered.len() - 1)];
            let b = filtered[(idx + 1).min(filtered.len() - 1)];
            a + (b - a) * frac
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_rate_is_identity() {
        let s = vec![0.1, 0.2, 0.3];
        assert_eq!(resample(&s, 16000, 16000), s);
    }

    #[test]
    fn downsample_length() {
        let s = vec![0.0; 48000];
        let out = resample(&s, 48000, 16000);
        assert_eq!(out.len(), 16000);
    }

    #[test]
    fn upsample_length() {
        let s = vec![0.0; 8000];
        let out = resample(&s, 8000, 16000);
        assert_eq!(out.len(), 16000);
    }

    #[test]
    fn preserves_sine_roughly() {
        // 440Hz サイン波を 48k→16k しても振幅が保たれること
        let sr = 48000;
        let s: Vec<f32> = (0..sr)
            .map(|i| (2.0 * std::f32::consts::PI * 440.0 * i as f32 / sr as f32).sin())
            .collect();
        let out = resample(&s, 48000, 16000);
        let peak = out.iter().fold(0.0f32, |m, v| m.max(v.abs()));
        assert!(peak > 0.7, "peak = {peak}");
    }
}
