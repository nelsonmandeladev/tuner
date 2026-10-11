import { APP_NAME } from "../app/brand";

/** Three-bar mark (the last bar accent and tallest) plus the wordmark. */
export function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-2.5">
      <svg width="26" height="22" viewBox="0 0 26 22" aria-hidden="true">
        <rect x="0" y="8" width="6" height="14" rx="3" className="fill-text" />
        <rect x="10" y="4" width="6" height="18" rx="3" className="fill-text" />
        <rect x="20" y="0" width="6" height="22" rx="3" className="fill-accent" />
      </svg>
      <span className="font-display text-wordmark">{APP_NAME}</span>
    </div>
  );
}
