import { I80F48 } from "@blockworks-foundation/mango-client/lib/src/fixednum";

export const i80f48ToPercent = (value: I80F48) =>
  value.mul(I80F48.fromNumber(100));

export function zipDict<K extends string | number | symbol, V>(
  keys: K[],
  values: V[]
): Partial<Record<K, V>> {
  const result: Partial<Record<K, V>> = {};
  keys.forEach((key, index) => {
    result[key] = values[index];
  });
  return result;
}
