# Privacy policy

Last updated: 13 October 2026

Tuner is a free, open-source video player for an IPTV subscription you already have. The short version: **Tuner collects nothing.** There is no account with us, no analytics, no tracking, no ads and no server of ours. The author never sees anything you do in the app.

## What Tuner connects to

- **Your provider's server**, at the address you type in. Tuner signs in, downloads the channel, movie and series lists and the TV guide, and plays streams from it.
- **Artwork addresses listed by your provider** (channel logos, posters). Your provider chooses these; they may be on other servers.

Nothing else. Those requests go straight from your computer to those servers, and what they log is covered by your provider's own privacy policy.

## What Tuner keeps on your computer

| Data | Where |
| --- | --- |
| Server address, username, account name | Tuner's local database in your user profile (`%APPDATA%\com.measdev.tuner`) |
| Password | Windows Credential Manager, never in a file |
| Library, TV guide, favourites, watch history, resume points, settings | The local database |
| Artwork and the search index | Tuner's cache (`%LOCALAPPDATA%\com.measdev.tuner`) |

None of this is sent anywhere. Removing an account in **Settings** deletes its data and its password. [docs/RELEASE.md](docs/RELEASE.md#what-an-uninstall-leaves) explains what an uninstall removes.

## Other software

Tuner shows its interface with Microsoft Edge WebView2, which is part of Windows. Microsoft's diagnostic data settings in Windows apply to it, not this policy.

## Changes and contact

Changes to this policy are made in this file, so its history is public. Questions: open an issue at <https://github.com/nelsonmandeladev/tuner/issues>.
