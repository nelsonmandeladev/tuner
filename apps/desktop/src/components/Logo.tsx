import { APP_NAME } from "../app/brand";

/**
 * Three-bar mark (the last bar accent and tallest) plus the wordmark. "s" is
 * the title bar's size (the sidebar no longer shows the logo, M5 review).
 */
export function Logo({ size = "m" }: { size?: "s" | "m" }) {
  const small = size === "s";
  return (
    <div className={`flex items-center ${small ? "gap-2" : "gap-2.5 px-2.5"}`}>
      <svg width={small ? 17 : 26} height={small ? 14 : 22} viewBox="0 0 26 22" aria-hidden="true">
        <rect x="0" y="8" width="6" height="14" rx="3" className="fill-text" />
        <rect x="10" y="4" width="6" height="18" rx="3" className="fill-text" />
        <rect x="20" y="0" width="6" height="22" rx="3" className="fill-accent" />
      </svg>
      <span className={`font-display ${small ? "text-small font-extrabold" : "text-wordmark"}`}>
        {APP_NAME}
      </span>
    </div>
  );
}
