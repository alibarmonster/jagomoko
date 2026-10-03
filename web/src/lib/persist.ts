/** localStorage persistence that survives bigint values (money, XP) and fails soft. */

export function stringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? { __big: v.toString() } : v));
}

export function parse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw, (_k, v) =>
      v && typeof v === "object" && "__big" in v && typeof (v as { __big: unknown }).__big === "string"
        ? BigInt((v as { __big: string }).__big)
        : v,
    ) as T;
  } catch {
    return null;
  }
}

export function load<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? parse<T>(raw) : null;
  } catch {
    return null; // storage blocked (private mode): the prototype still works in memory
  }
}

export function save(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, stringify(value));
  } catch {
    /* ignore */
  }
}
