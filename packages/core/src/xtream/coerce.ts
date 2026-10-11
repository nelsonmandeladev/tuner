/**
 * Field coercers for provider JSON (docs/XTREAM_API.md "Quirks"): numbers come
 * as strings or numbers, booleans as 0/1/"0"/"1", empty values as "", null,
 * [] or {}. Each schema field goes through one of these, so a single odd value
 * never rejects an item. Only a missing id does (see `id`).
 */

import * as z from "zod";

/**
 * Any value, and the key may be missing. Every coercer starts here: in zod 4
 * an object key is optional only if its schema is, and a transform is not.
 */
export const anyValue = z.unknown().optional();

export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** A number or null. */
export const num = anyValue.transform(toNumber);

/** A whole number, or null. */
export const int = anyValue.transform((v) => {
  const n = toNumber(v);
  return n === null ? null : Math.trunc(n);
});

/** A positive integer id. The only coercer that fails: an item without an id is skipped. */
export const id = anyValue.transform(toNumber).pipe(z.number().int().positive());

/** A non-empty string, or null. Numbers become strings; "", objects and arrays become null. */
export const text = anyValue.transform((v) => {
  if (typeof v === "string") return v.trim() === "" ? null : v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
});

/** Like `text`, but an empty value becomes "" (for names that must exist). */
export const name = anyValue.transform((v) => {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
});

/** 1, "1", true, "true" → true; anything else → false. */
export const flag = anyValue.transform((v) => v === 1 || v === "1" || v === true || v === "true");

/** Unix seconds (string or number) → milliseconds, or null. */
export const unixMs = anyValue.transform((v) => {
  const n = toNumber(v);
  return n === null || n <= 0 ? null : n * 1000;
});

/** The first non-empty string of a string or a string array (e.g. `backdrop_path`). */
export const firstText = anyValue.transform((v) => {
  const values = Array.isArray(v) ? v : [v];
  const found = values.find((x): x is string => typeof x === "string" && x.trim() !== "");
  return found ?? null;
});

/** A plain object, or null for anything else (providers send [] for an empty object). */
export const record = anyValue.transform((v) =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null,
);

/**
 * An object schema that also accepts a missing value, null or [] (providers
 * send [] for empty objects) and parses it as {}. Use it for nested objects
 * whose fields all have defaults.
 */
export function loose<T extends z.core.$ZodLooseShape>(shape: T) {
  return z.preprocess(
    (v) => (v !== null && typeof v === "object" && !Array.isArray(v) ? v : {}),
    z.object(shape),
  );
}

/** Base64 (EPG titles and descriptions) → UTF-8 text. Plain text passes through. */
export function decodeBase64(value: string): string {
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return value;
  }
}

export const base64Text = anyValue.transform((v) => {
  if (typeof v !== "string" || v === "") return null;
  return decodeBase64(v);
});
