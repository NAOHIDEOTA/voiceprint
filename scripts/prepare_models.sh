#!/usr/bin/env bash
# ONNX モデルを取得し、small (int8量子化) を生成して models/ に配置する。
# 出力ファイル名は src/core/models.ts の MODELS と一致させること。
# 生成物は GitHub Releases (tag: models-v1) にアップロードして配布する。
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p models

SHERPA_BASE="https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models"

download() {
  local src="$1" dest="$2"
  if [ -f "$dest" ]; then
    echo "skip (exists): $dest"
  else
    echo "download: $src"
    curl -fL --retry 3 -o "$dest.tmp" "$src"
    mv "$dest.tmp" "$dest"
  fi
}

# base: 3D-Speaker CAM++ (zh+en バイリンガル, advanced) 192次元 約27MB
download "$SHERPA_BASE/3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx" "models/campplus-zhen.onnx"

# large: 3D-Speaker ERes2NetV2 192次元 約69MB
download "$SHERPA_BASE/3dspeaker_speech_eres2netv2_sv_zh-cn_16k-common.onnx" "models/eres2netv2-zh.onnx"

# small: base を int8 静的量子化。キャリブレーション用の実音声 fbank 特徴量を
# 先に生成する (tests/dump_calibration.mjs → /tmp/calib)
if [ -f models/campplus-zhen-int8.onnx ]; then
  echo "skip (exists): models/campplus-zhen-int8.onnx"
else
  node tests/dump_calibration.mjs /tmp/calib
  python3 scripts/quantize.py models/campplus-zhen.onnx models/campplus-zhen-int8.onnx /tmp/calib
  rm -f models/campplus-zhen.onnx.pre.onnx
fi

echo
ls -lh models/*.onnx
