#!/usr/bin/env node
/**
 * Builds the MSIX package (docs/RELEASE.md) with the winapp CLI (DECISIONS
 * D11). Run from the repo root:
 *
 *   pnpm pack:msix            release build, stage, pack, sign with ./devcert.pfx
 *   pnpm pack:msix --skip-build   pack the last release build again
 *   pnpm pack:msix --store    unsigned package for Microsoft Store upload (the Store signs it)
 *
 * 1. Keeps the manifest version equal to tauri.conf.json's (x.y.z → x.y.z.0):
 *    Windows only updates an installed package to a higher version.
 * 2. `pnpm tauri build` (also writes the NSIS and MSI installers).
 * 3. Stages the files in the layout the NSIS install uses: tuner.exe and
 *    vcruntime140.dll, and the libmpv DLLs in lib/ beside them
 *    (tauri-plugin-libmpv looks for libmpv-wrapper.dll next to the exe and
 *    in lib/; the wrapper's C runtime must sit next to the exe).
 * 4. `winapp pack` with apps/desktop/msix/Package.appxmanifest. The dev
 *    certificate is created on first use (publisher read from the manifest).
 *    Its password, "password", is public: local and Sandbox testing only.
 *    The certificate is never committed (.gitignore) and is not installed
 *    on this machine by this script.
 */

import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const DESKTOP = join(ROOT, "apps", "desktop");
const TAURI = join(DESKTOP, "src-tauri");
const MANIFEST = join(DESKTOP, "msix", "Package.appxmanifest");
const STAGE = join(TAURI, "target", "msix-stage");
const OUT_DIR = join(TAURI, "target", "release", "bundle", "msix");
const CERT = join(ROOT, "devcert.pfx");

const args = new Set(process.argv.slice(2));
const store = args.has("--store");
const env = { ...process.env, WINAPP_CLI_TELEMETRY_OPTOUT: "1" };
env.CARGO_BUILD_JOBS ??= "4";

const run = (cmd, cmdArgs, opts = {}) =>
  execFileSync(cmd, cmdArgs, {
    stdio: "inherit",
    env,
    shell: process.platform === "win32",
    ...opts,
  });

// 1. Version in step with tauri.conf.json.
const { version } = JSON.parse(readFileSync(join(TAURI, "tauri.conf.json"), "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(version))
  throw new Error(`tauri.conf.json version ${version} is not x.y.z`);
const msixVersion = `${version}.0`;
const manifest = readFileSync(MANIFEST, "utf8");
const synced = manifest.replace(
  /(<Identity[\s\S]*?Version=")[^"]*(")/,
  (_, before, after) => `${before}${msixVersion}${after}`,
);
if (synced !== manifest) {
  writeFileSync(MANIFEST, synced);
  console.log(`manifest version set to ${msixVersion}`);
}

// 2. Release build.
if (!args.has("--skip-build")) run("pnpm", ["tauri", "build"], { cwd: ROOT });

// 3. Stage: the exe and lib/ as the NSIS install has them.
rmSync(STAGE, { recursive: true, force: true });
mkdirSync(join(STAGE, "lib"), { recursive: true });
copyFileSync(join(TAURI, "target", "release", "tuner.exe"), join(STAGE, "tuner.exe"));
for (const dll of ["libmpv-2.dll", "libmpv-wrapper.dll"]) {
  copyFileSync(join(TAURI, "lib", dll), join(STAGE, "lib", dll));
}
// The Visual C++ runtime libmpv-wrapper.dll needs, beside the exe where Windows
// looks for it (app-local deployment; a clean Windows has none, seen in M6).
copyFileSync(join(TAURI, "lib", "vcruntime140.dll"), join(STAGE, "vcruntime140.dll"));
// The licence and the notices the LGPL libraries need, as in tauri.conf.json.
copyFileSync(join(ROOT, "LICENSE"), join(STAGE, "LICENSE.txt"));
copyFileSync(join(ROOT, "THIRD_PARTY_NOTICES.md"), join(STAGE, "THIRD_PARTY_NOTICES.md"));

// 4. Pack (and sign with the dev certificate unless it is for the Store).
mkdirSync(OUT_DIR, { recursive: true });
const output = join(OUT_DIR, `Tuner_${msixVersion}_x64${store ? "_store" : ""}.msix`);
rmSync(output, { force: true });
const packArgs = ["pack", STAGE, "--manifest", MANIFEST, "--output", output];
if (store) {
  packArgs.push("--no-sign");
} else {
  if (!existsSync(CERT)) {
    run("winapp", [
      "cert",
      "generate",
      "--manifest",
      MANIFEST,
      "--output",
      CERT,
      "--if-exists",
      "skip",
    ]);
  }
  packArgs.push("--cert", CERT);
}
run("winapp", packArgs, { cwd: join(DESKTOP, "msix") });

const mib = (statSync(output).size / 1024 / 1024).toFixed(2);
console.log(`MSIX ${store ? "(unsigned, for the Store) " : ""}${mib} MiB: ${output}`);
