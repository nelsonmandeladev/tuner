import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * Provider artwork goes through the Rust image cache (D7, src-tauri/src/images.rs):
 * it fixes mixed-content blocking for plain-http logos and keeps posters
 * offline. Components use this instead of the provider URL; null when there
 * is no artwork, so they can show the generated fallback (DESIGN.md "Artwork").
 */
export function artworkUrl(url: string | null | undefined): string | null {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return convertFileSrc(url, "img");
}
