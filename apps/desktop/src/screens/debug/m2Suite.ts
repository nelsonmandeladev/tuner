/**
 * M2 acceptance suite (docs/ROADMAP.md "M2"), dev builds only. Runs when the
 * app starts with `TUNER_M2_SUITE=1`, using the .env.local account through
 * the same `connect()` and sync the Connect screen uses. Results print to
 * the `tauri dev` terminal as `[player] … RESULT` lines (redacted; counts
 * and timings only).
 */

import { secretKey } from "@tuner/core";
import { keychain } from "../../data/secrets";
import { connect, syncActive, useSession } from "../../data/session";

export interface DevCredentials {
  server: string;
  username: string;
  password: string;
}

type Log = (line: string) => void;

const clock = () => new Date().toTimeString().slice(0, 8);

export async function runM2Suite(creds: DevCredentials, log: Log, goHome: () => void) {
  const results: Record<string, string> = {};
  const check = (name: string, pass: boolean, detail: string) => {
    results[name] = `${pass ? "PASS" : "FAIL"} ${detail}`;
    log(`${clock()} RESULT ${name}: ${results[name]}`);
  };

  try {
    // No live wrong-password attempt: this provider answers one with HTTP 429 and
    // repeated failures get an IP blocked. The mapping is covered by core tests.

    // Port 9 (discard) on loopback: refused at once, no traffic leaves the machine.
    const t0 = performance.now();
    const dead = await connect({ ...creds, server: "http://127.0.0.1:9", name: "" });
    check(
      "unreachable-server",
      !dead.ok && dead.error === "unreachable",
      `${dead.ok ? "accepted?!" : dead.error} in ${Math.round(performance.now() - t0)} ms`,
    );

    const t1 = performance.now();
    const ok = await connect({ ...creds, name: "Dev subscription" });
    check("connect", ok.ok, ok.ok ? `in ${Math.round(performance.now() - t1)} ms` : ok.error);
    if (!ok.ok) return;

    const stored = await keychain.get(secretKey(ok.account.id));
    check(
      "password-in-keychain",
      stored === creds.password,
      stored === null ? "missing" : "present",
    );

    const t2 = performance.now();
    let liveAt: number | null = null;
    const unsubscribe = useSession.subscribe((s) => {
      if (liveAt === null && s.sync.steps.live.status === "done") liveAt = performance.now() - t2;
    });
    await syncActive();
    unsubscribe();
    const { sync, counts } = useSession.getState();
    const steps = Object.entries(sync.steps).map(
      ([step, s]) => `${step}=${s.count ?? "?"}(${s.status})`,
    );
    check(
      "first-sync",
      !sync.error && Object.values(sync.steps).every((s) => s.status === "done"),
      `${steps.join(" ")}; live usable after ${Math.round(liveAt ?? -1)} ms, all done in ${Math.round(performance.now() - t2)} ms; stored ${JSON.stringify(counts)}`,
    );
    goHome();
  } catch (error) {
    log(`${clock()} SUITE ERROR ${String(error)}`);
  } finally {
    log(`${clock()} SUITE DONE ${JSON.stringify(results)}`);
  }
}
