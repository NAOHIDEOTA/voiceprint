#!/usr/bin/env python3
"""ONNX モデルの int8 静的量子化 (small tier 生成用)。

動的量子化は Conv を ConvInteger に変換するが、ONNX Runtime Web (wasm) には
ConvInteger の実装が無くロードに失敗する。QLinearConv を生成する静的量子化
(QOperator 形式) を使い、キャリブレーションには実音声の fbank 特徴量
(JSON: {frames, bins, data}) を与える。

usage: quantize.py <input.onnx> <output.onnx> <calib_dir>
"""
import glob
import json
import sys

import numpy as np
from onnxruntime.quantization import (
    CalibrationDataReader,
    QuantFormat,
    QuantType,
    quantize_static,
)
from onnxruntime.quantization.shape_inference import quant_pre_process


class FbankReader(CalibrationDataReader):
    def __init__(self, calib_dir: str, input_name: str):
        self.files = sorted(glob.glob(f"{calib_dir}/*.json"))
        if not self.files:
            raise SystemExit(f"no calibration data in {calib_dir}")
        self.input_name = input_name
        self.i = 0

    def get_next(self):
        if self.i >= len(self.files):
            return None
        with open(self.files[self.i]) as f:
            d = json.load(f)
        self.i += 1
        feats = np.array(d["data"], dtype=np.float32).reshape(1, d["frames"], d["bins"])
        return {self.input_name: feats}


def main() -> None:
    if len(sys.argv) != 4:
        print("usage: quantize.py <input.onnx> <output.onnx> <calib_dir>", file=sys.stderr)
        sys.exit(1)
    src, dest, calib_dir = sys.argv[1], sys.argv[2], sys.argv[3]

    import onnxruntime as ort

    input_name = ort.InferenceSession(src).get_inputs()[0].name

    # shape 推論などの前処理 (量子化の推奨手順)
    pre = src + ".pre.onnx"
    quant_pre_process(src, pre, skip_symbolic_shape=True)

    quantize_static(
        pre,
        dest,
        calibration_data_reader=FbankReader(calib_dir, input_name),
        quant_format=QuantFormat.QOperator,
        activation_type=QuantType.QUInt8,
        weight_type=QuantType.QInt8,
        op_types_to_quantize=["Conv", "MatMul", "Gemm"],
    )
    print(f"quantized: {src} -> {dest}")


if __name__ == "__main__":
    main()
