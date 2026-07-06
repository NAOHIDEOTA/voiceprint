/** ベクトル演算の内部ユーティリティ */

export function assertSameLength(a: Float32Array, b: Float32Array): void {
  if (a.length !== b.length) {
    throw new Error(`vector dimension mismatch: ${a.length} vs ${b.length}`);
  }
}

export function assertVectorLength(
  vector: Float32Array,
  expectedLength: number,
  label: string,
): void {
  if (vector.length !== expectedLength) {
    throw new Error(
      `invalid ${label}: vector length ${vector.length} does not match dimension ${expectedLength}`,
    );
  }
}

export function l2Normalize(vector: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < vector.length; i++) norm += vector[i] * vector[i];
  norm = Math.sqrt(norm) || 1;

  const normalized = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i++) normalized[i] = vector[i] / norm;
  return normalized;
}
