/**
 * Credential redaction for anything that may reach a log (CLAUDE.md rule 3).
 *
 * Xtream URLs carry the username and password in two places: as query
 * parameters on player_api.php and as path segments in stream URLs
 * (/live/{u}/{p}/…). Both are masked. Pass the account's known secrets to also
 * catch them anywhere else in the text (error messages, response bodies).
 */

export const REDACTED = "***";

const QUERY_CREDENTIAL = /([?&](?:username|password)=)[^&#\s"']*/gi;
const STREAM_PATH = /(\/(?:live|movie|series|timeshift)\/)[^/\s?#"']+\/[^/\s?#"']+\//gi;

export function redact(text: string, secrets: readonly (string | null | undefined)[] = []): string {
  let out = text
    .replace(QUERY_CREDENTIAL, `$1${REDACTED}`)
    .replace(STREAM_PATH, `$1${REDACTED}/${REDACTED}/`);

  for (const secret of secrets) {
    if (!secret) continue;
    for (const form of new Set([secret, encodeURIComponent(secret)])) {
      out = out.split(form).join(REDACTED);
    }
  }
  return out;
}
