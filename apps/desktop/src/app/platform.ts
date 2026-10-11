export const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);

/** Keyboard hint for a shortcut with the primary modifier: "⌘K" on macOS, "Ctrl K" elsewhere. */
export function shortcutLabel(key: string): string {
  return isMac ? `⌘${key}` : `Ctrl ${key}`;
}

/** True when the platform's primary modifier (⌘ / Ctrl) is held. */
export function hasModKey(event: KeyboardEvent): boolean {
  return isMac ? event.metaKey : event.ctrlKey;
}
