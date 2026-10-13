/**
 * Puts the three DLLs the player needs in apps/desktop/src-tauri/lib/
 * (gitignored, bundled as resources by tauri.conf.json):
 *
 * - libmpv-2.dll from the zhongfly/mpv-winbuild LGPL build (non-v3),
 * - libmpv-wrapper.dll from nini22P/libmpv-wrapper,
 * - vcruntime140.dll from the installed Visual Studio's redist folder
 *   (libmpv-wrapper.dll needs it; a clean Windows has none, DECISIONS.md).
 *
 * Archives are checked against pinned SHA-256 digests (GitHub's own asset
 * digests) and extracted with Windows' tar.exe, which reads 7z. To move to
 * a new build, change RELEASES and the versions in CLAUDE.md and
 * THIRD_PARTY_NOTICES.md together.
 *
 *   node scripts/fetch-libmpv.mjs [--force]
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const LIB = join(ROOT, "apps", "desktop", "src-tauri", "lib");

const RELEASES = [
  {
    url: "https://github.com/zhongfly/mpv-winbuild/releases/download/2026-10-11-d94d095814/mpv-dev-lgpl-x86_64-20261011-git-d94d095814.7z",
    sha256: "72bc1e3fe1c8aaf17b5243003b110a522d109caf6d871cbc8e05996238b93d06",
    member: "libmpv-2.dll",
  },
  {
    url: "https://github.com/nini22P/libmpv-wrapper/releases/download/v0.1.1/libmpv-wrapper-windows-x86_64.zip",
    sha256: "d2ff8b2edcd34d2968e544adaa915e5e5c48eb1a0995945005269c2af119a492",
    member: "bin/libmpv-wrapper.dll",
  },
];

if (process.platform !== "win32") {
  console.error("fetch-libmpv: Windows only (the DLLs and Visual Studio are Windows parts).");
  process.exit(1);
}

const force = process.argv.includes("--force");
const SYSTEM32 = join(process.env.SystemRoot ?? "C:\\Windows", "System32");
mkdirSync(LIB, { recursive: true });

// 1. libmpv and the wrapper.
const work = mkdtempSync(join(tmpdir(), "tuner-libmpv-"));
try {
  for (const { url, sha256, member } of RELEASES) {
    const name = member.split("/").pop();
    if (existsSync(join(LIB, name)) && !force) {
      console.log(`${name}: already there (--force to fetch again)`);
      continue;
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    const data = Buffer.from(await response.arrayBuffer());
    const digest = createHash("sha256").update(data).digest("hex");
    if (digest !== sha256) throw new Error(`${url}: SHA-256 ${digest}, expected ${sha256}`);
    const archive = join(work, url.split("/").pop());
    writeFileSync(archive, data);
    // Windows' own tar (libarchive) reads 7z and zip; a Git Bash tar on PATH does not.
    execFileSync(join(SYSTEM32, "tar.exe"), ["-xf", archive, "-C", work, member], {
      stdio: "inherit",
    });
    copyFileSync(join(work, member), join(LIB, name));
    console.log(`${name}: verified and copied`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

// 2. The Visual C++ runtime, from the newest redist of the newest Visual Studio.
const runtime = join(LIB, "vcruntime140.dll");
if (existsSync(runtime) && !force) {
  console.log("vcruntime140.dll: already there (--force to copy again)");
} else {
  const vswhere = join(
    process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
    "Microsoft Visual Studio",
    "Installer",
    "vswhere.exe",
  );
  if (!existsSync(vswhere))
    throw new Error(
      "Visual Studio (or its Build Tools) not found: install the Tauri prerequisites",
    );
  const vs = execFileSync(vswhere, ["-latest", "-products", "*", "-property", "installationPath"], {
    encoding: "utf8",
  }).trim();
  const redist = join(vs, "VC", "Redist", "MSVC");
  const byVersion = (a, b) => b.localeCompare(a, undefined, { numeric: true });
  const version = readdirSync(redist)
    .filter((d) => /^\d+\.\d+\.\d+$/.test(d))
    .sort(byVersion)[0];
  if (!version) throw new Error(`no MSVC redist under ${redist}`);
  const crt = readdirSync(join(redist, version, "x64"))
    .filter((d) => /^Microsoft\.VC\d+\.CRT$/.test(d))
    .sort(byVersion)[0];
  if (!crt) throw new Error(`no Microsoft.VC*.CRT folder in ${join(redist, version, "x64")}`);
  const source = join(redist, version, "x64", crt, "vcruntime140.dll");
  // Ship only a copy Microsoft signed.
  const signer = execFileSync(
    join(SYSTEM32, "WindowsPowerShell", "v1.0", "powershell.exe"),
    [
      "-NoProfile",
      "-Command",
      `$s = Get-AuthenticodeSignature -LiteralPath '${source}'; "$($s.Status)|$($s.SignerCertificate.Subject)"`,
    ],
    { encoding: "utf8" },
  ).trim();
  if (!signer.startsWith("Valid|") || !signer.includes("O=Microsoft Corporation")) {
    throw new Error(`${source} is not validly signed by Microsoft: ${signer}`);
  }
  copyFileSync(source, runtime);
  console.log(`vcruntime140.dll: copied from MSVC ${version} ${crt} (Microsoft-signed)`);
}
