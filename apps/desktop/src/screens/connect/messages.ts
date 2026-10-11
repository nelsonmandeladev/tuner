import type { ConnectError } from "../../data/session";

/**
 * What went wrong and what to do (DESIGN.md "States": no apologies, no codes).
 * SPEC §1: wrong credentials, server unreachable, account expired.
 */
export function connectErrorMessage(error: ConnectError, status?: string | null): string {
  switch (error) {
    case "invalid-server":
      return "Enter the server URL your provider gave you, for example http://host:8080.";
    case "missing-fields":
      return "Enter your username and password.";
    case "wrong-credentials":
      return "The username or password was not accepted. Check them against the details your provider sent.";
    case "inactive":
      return `This subscription is ${status ? status.toLowerCase() : "not active"}. Contact your provider to renew it, then try again.`;
    case "rate-limited":
      return "The server refused this login. Check your username and password; if they are right, wait a minute before trying again, as servers block repeated attempts.";
    case "unreachable":
      return "The server did not answer. Check the server URL and your internet connection.";
    case "bad-response":
      return "The server answered, but not like an Xtream Codes server. Check the server URL.";
    case "storage":
      return "Your login worked, but it could not be saved on this computer. Try again.";
    case "aborted":
      return "Connecting was cancelled.";
  }
}

/** For a failed sync: the login worked earlier, so the cause is usually the network. */
export function syncErrorMessage(error: ConnectError): string {
  switch (error) {
    case "unreachable":
      return "The server stopped answering while your lists were loading. Check your connection and try again.";
    case "wrong-credentials":
      return "The provider no longer accepts this login. Sign in again.";
    case "inactive":
      return "This subscription is no longer active. Contact your provider to renew it.";
    default:
      return "Your lists could not be loaded completely. Try again.";
  }
}
