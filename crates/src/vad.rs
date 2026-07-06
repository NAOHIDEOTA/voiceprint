//! エネルギーベースの簡易 VAD (Voice Activity Detection)。
//!
//! フレーム RMS のノイズフロア推定 + 適応しきい値 + ハングオーバーで
//! 発話区間を検出する。追加モデルのダウンロードが不要な MVP 実装。

pub const FRAME_LEN: usize = 400; // 25ms @ 16kHz
pub const FRAME_HOP: usize = 160; // 10ms @ 16kHz

/// 発話フレームの前後に付与するハングオーバー (フレーム数)
const HANG_BEFORE: usize = 5; // 50ms
const HANG_AFTER: usize = 20; // 200ms

/// 適応しきい値: ノイズフロアの倍率と絶対下限
const NOISE_FLOOR_RATIO: f32 = 3.0;
const ABS_MIN_RMS: f32 = 0.0015;

pub struct VadResult {
    /// 発話区間のみを連結したサンプル列
    pub speech: Vec<f32>,
    /// 発話時間 (ms)
    pub speech_ms: u32,
    /// フレームごとの発話判定 (可視化・デバッグ用)
    pub frame_mask: Vec<bool>,
    /// 非発話フレームの平均 RMS (SNR 推定用)。非発話フレームが無ければ None
    pub noise_rms: Option<f32>,
    /// 発話フレームの平均 RMS。発話が無ければ None
    pub speech_rms: Option<f32>,
}

/// フレームマスクに従って発話サンプルを連結抽出する
/// (フレーム hop 単位で連結し、末尾フレームは全長を含める)。
/// マスクを検出した信号と別スケールの信号 (正規化前の原音声) にも適用できる。
pub fn extract_by_mask(samples: &[f32], mask: &[bool]) -> Vec<f32> {
    let mut speech = Vec::new();
    for (i, &active) in mask.iter().enumerate() {
        if active {
            let start = i * FRAME_HOP;
            let end = if i + 1 < mask.len() && mask[i + 1] {
                start + FRAME_HOP
            } else {
                (start + FRAME_LEN).min(samples.len())
            };
            speech.extend_from_slice(&samples[start..end]);
        }
    }
    speech
}

fn frame_rms(samples: &[f32]) -> Vec<f32> {
    if samples.len() < FRAME_LEN {
        return vec![];
    }
    let num_frames = (samples.len() - FRAME_LEN) / FRAME_HOP + 1;
    (0..num_frames)
        .map(|i| {
            let start = i * FRAME_HOP;
            let frame = &samples[start..start + FRAME_LEN];
            (frame.iter().map(|v| v * v).sum::<f32>() / FRAME_LEN as f32).sqrt()
        })
        .collect()
}

/// 発話区間を検出し、発話サンプルのみを返す
pub fn detect(samples: &[f32]) -> VadResult {
    let rms = frame_rms(samples);
    if rms.is_empty() {
        return VadResult {
            speech: vec![],
            speech_ms: 0,
            frame_mask: vec![],
            noise_rms: None,
            speech_rms: None,
        };
    }

    // ノイズフロア = RMS の下位10パーセンタイル
    let mut sorted = rms.clone();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let noise_floor = sorted[sorted.len() / 10];
    let threshold = (noise_floor * NOISE_FLOOR_RATIO).max(ABS_MIN_RMS);

    let raw_mask: Vec<bool> = rms.iter().map(|&v| v >= threshold).collect();

    // ハングオーバー: 発話フレームの前後を発話扱いに広げる
    let mut mask = vec![false; raw_mask.len()];
    for (i, &active) in raw_mask.iter().enumerate() {
        if active {
            let lo = i.saturating_sub(HANG_BEFORE);
            let hi = (i + HANG_AFTER + 1).min(raw_mask.len());
            for m in mask[lo..hi].iter_mut() {
                *m = true;
            }
        }
    }

    let speech = extract_by_mask(samples, &mask);

    let speech_frames = mask.iter().filter(|&&m| m).count();
    let noise_frames: Vec<f32> = rms
        .iter()
        .zip(&mask)
        .filter(|(_, &m)| !m)
        .map(|(&v, _)| v)
        .collect();
    let speech_rms_vals: Vec<f32> = rms
        .iter()
        .zip(&mask)
        .filter(|(_, &m)| m)
        .map(|(&v, _)| v)
        .collect();

    let mean = |v: &[f32]| -> Option<f32> {
        if v.is_empty() {
            None
        } else {
            Some(v.iter().sum::<f32>() / v.len() as f32)
        }
    };

    VadResult {
        speech,
        speech_ms: (speech_frames * FRAME_HOP * 1000 / 16000) as u32,
        frame_mask: mask,
        noise_rms: mean(&noise_frames),
        speech_rms: mean(&speech_rms_vals),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tone(len: usize, amp: f32) -> Vec<f32> {
        (0..len)
            .map(|i| amp * (2.0 * std::f32::consts::PI * 220.0 * i as f32 / 16000.0).sin())
            .collect()
    }

    #[test]
    fn silence_has_no_speech() {
        let samples = vec![0.0f32; 16000 * 3];
        let r = detect(&samples);
        assert_eq!(r.speech_ms, 0);
        assert!(r.speech.is_empty());
    }

    #[test]
    fn detects_tone_between_silence() {
        // 1秒無音 + 2秒トーン + 1秒無音
        let mut samples = vec![0.0f32; 16000];
        samples.extend(tone(16000 * 2, 0.5));
        samples.extend(vec![0.0f32; 16000]);
        let r = detect(&samples);
        // ハングオーバー込みで概ね 2 秒前後
        assert!(r.speech_ms >= 1800, "speech_ms = {}", r.speech_ms);
        assert!(r.speech_ms <= 2600, "speech_ms = {}", r.speech_ms);
        assert!(r.noise_rms.is_some());
        assert!(r.speech_rms.unwrap() > r.noise_rms.unwrap() * 2.0);
    }

    #[test]
    fn low_noise_not_detected_as_speech() {
        // 小さいホワイトノイズのみ (擬似乱数)
        let mut seed = 1u32;
        let samples: Vec<f32> = (0..16000 * 3)
            .map(|_| {
                seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
                ((seed >> 16) as f32 / 32768.0 - 1.0) * 0.001
            })
            .collect();
        let r = detect(&samples);
        assert_eq!(r.speech_ms, 0, "speech_ms = {}", r.speech_ms);
    }
}
