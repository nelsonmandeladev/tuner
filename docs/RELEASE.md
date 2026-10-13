# Release

How to build, package, sign, install, test and remove Tuner on Windows, and how to submit it to the Microsoft Store. Commands run from the repo root unless a section says otherwise.

| Package | Made by | Signed with | Size (0.1.0, 2026-10-12) |
| --- | --- | --- | --- |
| NSIS `Tuner_<version>_x64-setup.exe` | `pnpm tauri build` | nothing yet (see "Signing") | 34.81 MiB |
| MSI `Tuner_<version>_x64_en-US.msi` | `pnpm tauri build` | nothing yet | 46.10 MiB |
| MSIX `Tuner_<version>.0_x64.msix` | `pnpm pack:msix` (winapp CLI, DECISIONS D11) | the local dev certificate, or unsigned for the Store | 47.35 MiB |

`libmpv-2.dll` is 96.5 MB of the 112 MB installed, so it decides every size here (D2 "Known issues").

## Before a release

1. The libmpv DLLs and `vcruntime140.dll` are in `apps/desktop/src-tauri/lib/` (`pnpm fetch:libmpv`; CLAUDE.md, "libmpv binaries"). Take `vcruntime140.dll` from the newest Visual Studio redist folder for each release (`pnpm fetch:libmpv --force`): Windows Update does not service an app-local copy. The release workflow always fetches fresh.
2. Bump the version in `apps/desktop/src-tauri/tauri.conf.json` (and `Cargo.toml`, `apps/desktop/package.json`). The MSIX version follows it as `x.y.z.0` (`pack:msix` writes it into the manifest). Windows only updates an installed MSIX to a higher version.
3. `pnpm lint`, `pnpm test`, `cargo test` in `apps/desktop/src-tauri`.
4. Check free space: a release build needs about 4 GB in `target/`.

## Publish a GitHub release

Users download the NSIS installer from the repo's Releases page (README, "Install").

1. Do "Before a release" steps 2 and 3, commit and push to `main`.
2. Tag and push: `git tag v0.1.0 && git push origin v0.1.0`.
3. `.github/workflows/release.yml` runs on GitHub's Windows runner: it checks the tag against `tauri.conf.json`, runs `pnpm test`, `pnpm fetch:libmpv` and `pnpm tauri build --bundles nsis`, then makes a **draft** release with `Tuner_<version>_x64-setup.exe`, its `.sha256` file, install notes and the changes since the last tag.
4. Download the installer from the draft, try it (a Sandbox run as in "Testing a clean install" is the best check), edit the notes, then **Publish release**.

The installer is unsigned, so SmartScreen shows "Windows protected your PC" until enough people have installed it; the release notes and README explain **More info → Run anyway**. Free code signing for open-source projects is available from the [SignPath Foundation](https://signpath.org) once the repo is public; it would sign in the release workflow.

## Build the NSIS and MSI installers

```bash
CARGO_BUILD_JOBS=4 pnpm tauri build
```

Output: `apps/desktop/src-tauri/target/release/bundle/nsis/` and `…/bundle/msi/`. The NSIS installer installs for the current user (no administrator rights) and downloads the WebView2 runtime if it is missing (`webviewInstallMode` default, about 0 MB added). Files go in the install folder as `tuner.exe`, `vcruntime140.dll` (the Visual C++ runtime `libmpv-wrapper.dll` needs; a clean Windows has none) and `lib\libmpv-2.dll`, `lib\libmpv-wrapper.dll`.

## Build the MSIX

Needs the winapp CLI (public preview; 0.7.1 was used):

```bash
winget install Microsoft.winappcli --source winget
```

winapp sends anonymous usage data unless `WINAPP_CLI_TELEMETRY_OPTOUT=1` is set; `pack:msix` sets it for its own calls. The first pack downloads the Windows SDK build tools into winapp's cache (`%USERPROFILE%\.winapp`).

```bash
pnpm pack:msix
```

What it does (`scripts/pack-msix.mjs`):

1. Sets the manifest's `Identity Version` from `tauri.conf.json`.
2. Runs `pnpm tauri build` (so NSIS and MSI are rebuilt too). `--skip-build` packs the last build again.
3. Stages `target/msix-stage/`: `tuner.exe`, `vcruntime140.dll` and `lib/` with the two libmpv DLLs, the layout the NSIS install has. The libmpv plugin loads `libmpv-wrapper.dll` from the exe's folder or its `lib/` folder.
4. Creates `devcert.pfx` at the repo root on first use (`winapp cert generate --manifest …`; publisher from the manifest) and runs `winapp pack <stage> --manifest apps/desktop/msix/Package.appxmanifest --cert devcert.pfx`.

Output: `apps/desktop/src-tauri/target/release/bundle/msix/Tuner_<version>.0_x64.msix`.

The manifest and its assets live in `apps/desktop/msix/` (made with `winapp init` without SDK setup). To redo the assets after an icon change:

```bash
cd apps/desktop/msix
winapp manifest update-assets ../app-icon.svg --manifest Package.appxmanifest
```

The Tauri icons are separate: `pnpm tauri icon apps/desktop/app-icon.svg`.

### The dev certificate

`devcert.pfx` and every other certificate, key and package are gitignored. Its password is winapp's default, `password`, which is public: anyone with the file can sign as `CN=MEASDEV`. Use it for local and Sandbox testing only.

To install a dev-signed MSIX the certificate must be trusted. That changes the machine's trusted certificates, so do it only on a test machine (Windows Sandbox does not need it, see below), from an administrator terminal:

```bash
winapp cert install ./devcert.pfx
```

## Signing

Decided for now (2026-10-12): **dev certificate only**; there is no production certificate yet. When one exists:

- A `.pfx` from a certificate authority: sign the NSIS installer, the MSI and the MSIX with a timestamp, so signatures outlive the certificate:

  ```bash
  winapp sign apps/desktop/src-tauri/target/release/bundle/nsis/Tuner_<version>_x64-setup.exe <cert.pfx> --password <password> --timestamp <RFC 3161 URL from the CA>
  ```

  Keep the certificate and its password outside the repo (a path and an environment variable). The MSIX's manifest `Publisher` must equal the certificate's subject.
- Azure Trusted Signing is the other route; it signs through Tauri's `bundle.windows.signCommand`. Not set up.
- Microsoft Store: no signing; the Store signs the package (next section).

## Microsoft Store

The Store is a target (2026-10-12). It signs the MSIX itself.

1. Reserve the name in Partner Center. Copy **Package/Identity/Name**, **Package/Identity/Publisher** and **Package/Properties/PublisherDisplayName** from Product identity into `apps/desktop/msix/Package.appxmanifest` (they replace `MEASDEV.Tuner`, `CN=MEASDEV`, `MEASDEV`). A dev certificate for local tests must then be made again with the new publisher (`winapp cert generate --manifest apps/desktop/msix/Package.appxmanifest --output devcert.pfx --if-exists overwrite`).
2. Build an unsigned package: `pnpm pack:msix --store` (`…_x64_store.msix`).
3. `winapp store` forwards to the Microsoft Store Developer CLI (`msstore`, downloaded on first use; it needs the .NET 9 Desktop Runtime). Set up the Partner Center API credentials once; they stay on this machine, never in the repo:

   ```bash
   winapp store reconfigure --tenantId <tenant> --sellerId <seller> --clientId <client> --clientSecret <secret>
   ```

4. Upload as a draft, check it in Partner Center, then publish:

   ```bash
   winapp store publish apps/desktop/src-tauri/target/release/bundle/msix/Tuner_<version>.0_x64_store.msix --appId <productId> --noCommit
   winapp store submission publish <productId>
   winapp store submission poll <productId>
   ```

The listing (description, screenshots, age rating, the "player for your own subscription, includes no channels" wording from SPEC "Legal") is done in Partner Center.

## Install, run, uninstall

| | NSIS | MSIX |
| --- | --- | --- |
| Install | Run the setup `.exe` (per user, no admin) | Double-click, or `Add-AppxPackage .\Tuner_<version>.0_x64.msix` (certificate trusted first) |
| App files | `%LOCALAPPDATA%\Tuner\` | `C:\Program Files\WindowsApps\MEASDEV.Tuner_<version>…\` (read-only) |
| Data (app.db, `account-<id>.db`) | `%APPDATA%\com.measdev.tuner\` | Same path as seen by the app; on a machine that never ran the NSIS build Windows writes it under `%LOCALAPPDATA%\Packages\MEASDEV.Tuner_<hash>\LocalCache\Roaming\com.measdev.tuner\` |
| Cache (images, search index, WebView2) | `%LOCALAPPDATA%\com.measdev.tuner\` | `%LOCALAPPDATA%\Packages\…\LocalCache\Local\com.measdev.tuner\` (same rule) |
| Passwords | Windows Credential Manager, `xtream:<id>.com.measdev.tuner` | Same (Credential Manager is not virtualised) |
| Uninstall | Settings → Apps; the uninstaller offers to delete the app data | Settings → Apps, or `Remove-AppxPackage`; the package and its redirected data go |
| Left behind | See "What an uninstall leaves" | See "What an uninstall leaves" |

An MSIX app reads existing files from the real `AppData` folder first: on a PC where the NSIS build ran, the MSIX build uses that data and it is not removed with the package.

### What an uninstall leaves

Removing an account in Settings deletes its database files, search index, keychain entry and the image cache (the M6 suite proves it with a file and keychain listing). An uninstall does not remove Credential Manager entries: **remove your accounts in Settings before uninstalling**, or delete the `xtream:…com.measdev.tuner` entries in Credential Manager afterwards.

Measured in Windows Sandbox on 2026-10-12 (0.1.0, clean Windows 11 26100, no Visual C++ runtime installed):

| Step | NSIS | MSIX |
| --- | --- | --- |
| Install | 6.5 s silent, 108.4 MB in `%LOCALAPPDATA%\Tuner` | `Add-AppxPackage` after trusting the dev certificate in the Sandbox |
| Connect → Live TV listed | 7.7 s | 6.5 s |
| Connect → watching (Start watching, Live TV, channel typed, first frame) | about 20 s | about 17 s |
| Decoding | software (no GPU decoder in the Sandbox) | software |
| Remove the last account in Settings | no account files, index, images or keychain entry left; back to Connect | same code |
| Uninstall, "Delete the application data" ticked | nothing left: no files, registry keys, shortcuts or keychain entries | — |
| Uninstall, box not ticked (also `/S`) | `%APPDATA%\com.measdev.tuner\app.db` (0.1 MB), `%LOCALAPPDATA%\com.measdev.tuner` (WebView2 profile, 15–34 MB), `HKCU\Software\MEASDEV\Tuner` | — |
| `Remove-AppxPackage` (2 s) | — | package and all its `LocalCache` data gone; only the keychain entry of an account not removed first stays |

## Testing a clean install in Windows Sandbox

winapp drives a Windows Sandbox (Windows 11 24H2 or later, virtualisation on). Windows Sandbox must be enabled once, by the user, from an administrator terminal, followed by a restart and opening Windows Sandbox from Start once:

```bash
dism.exe /Online /Enable-Feature /FeatureName:Containers-DisposableClientVM /All /NoRestart
```

winapp keeps its Sandbox state under `%USERPROFILE%\.winapp`, and Windows Sandbox refused to share that folder on the development PC (`E_ACCESSDENIED` while preparing the guest agent). Point it elsewhere for every winapp call, e.g. `$env:WINAPP_TARGET_STATE_ROOT = "$env:TEMP\winapp-state"`.

Then, without touching the host's certificates or apps:

```bash
winapp target push sandbox apps/desktop/src-tauri/target/release/bundle/nsis/Tuner_0.1.0_x64-setup.exe Setup/Tuner-setup.exe
winapp target exec sandbox --cwd C:/WinApp/work/Setup -- Tuner-setup.exe /S
winapp run apps/desktop/src-tauri/target/msix-stage --manifest apps/desktop/msix/Package.appxmanifest --on sandbox --detach
winapp ui inspect --on sandbox -a tuner
winapp ui screenshot --on sandbox -a tuner -o sandbox-tuner.png
winapp target screenshot sandbox -o sandbox-desktop.png
```

`winapp run … --on sandbox` registers the staged layout as a development package inside the Sandbox (package identity, the same virtualisation as an installed MSIX) and installs nothing on the host. Expect software video decoding in the Sandbox (no GPU passthrough): report it, it is not a failure. A Sandbox opened by hand is left as it is; stop winapp's with `wsb stop --id <id>` once evidence is saved.
