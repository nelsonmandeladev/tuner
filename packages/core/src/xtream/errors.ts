/**
 * What can go wrong talking to a provider, in the terms SPEC §1 shows the user.
 * Messages here are for logs and are already redacted; screens map `kind` to
 * their own copy.
 */

export type XtreamErrorKind =
  /** `auth: 0`: wrong username or password. */
  | "wrong-credentials"
  /** Account status is not Active (Expired, Banned, Disabled…). `status` holds it. */
  | "inactive"
  /**
   * HTTP 429. Some providers answer a wrong password this way, others use it
   * after repeated attempts: the user should check the login, then wait.
   */
  | "rate-limited"
  /** No answer: DNS, refused, timed out. */
  | "unreachable"
  /** An answer that is not the expected JSON (HTML error page, rate limit…). */
  | "bad-response"
  | "aborted";

export class XtreamError extends Error {
  readonly kind: XtreamErrorKind;
  /** The account status for `inactive` (e.g. "Expired"). */
  readonly status: string | null;

  constructor(kind: XtreamErrorKind, message: string, status: string | null = null) {
    super(message);
    this.name = "XtreamError";
    this.kind = kind;
    this.status = status;
  }
}
