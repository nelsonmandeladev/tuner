import { describe, expect, it } from "vitest";
import { REDACTED, redact } from "../src/redact";

// Placeholder host and credentials only (CLAUDE.md rule 4: no real sources).
const server = "http://provider.example:8080";

describe("redact", () => {
  it("masks credentials in player_api query parameters", () => {
    const url = `${server}/player_api.php?username=alice&password=s3cret&action=get_live_streams`;
    expect(redact(url)).toBe(
      `${server}/player_api.php?username=${REDACTED}&password=${REDACTED}&action=get_live_streams`,
    );
  });

  it.each(["live", "movie", "series", "timeshift"])(
    "masks credentials in /%s/ stream paths",
    (kind) => {
      expect(redact(`${server}/${kind}/alice/s3cret/4521.ts`)).toBe(
        `${server}/${kind}/${REDACTED}/${REDACTED}/4521.ts`,
      );
    },
  );

  it("keeps the catch-up duration and start segments", () => {
    expect(redact(`${server}/timeshift/alice/s3cret/120/2026-10-11:17-30/4521.ts`)).toBe(
      `${server}/timeshift/${REDACTED}/${REDACTED}/120/2026-10-11:17-30/4521.ts`,
    );
  });

  it("masks URLs embedded in longer messages", () => {
    const message = `mpv failed to open "${server}/live/alice/s3cret/1.m3u8": 403`;
    expect(redact(message)).not.toMatch(/alice|s3cret/);
  });

  it("masks known secrets anywhere, raw and URL-encoded", () => {
    const password = "p@ss word&1";
    const text = `auth failed for ${password} (${encodeURIComponent(password)})`;
    expect(redact(text, [password])).toBe(`auth failed for ${REDACTED} (${REDACTED})`);
  });

  it("ignores empty secrets and leaves clean text unchanged", () => {
    const text = `${server}/player_api.php`;
    expect(redact(text, ["", null, undefined])).toBe(text);
  });
});
