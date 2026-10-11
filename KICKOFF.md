# Starting the build in Claude Code

## Before the first session

1. Make an empty folder (or Git repo) and copy everything from this package into it.
2. Copy `.env.example` to `.env.local` and fill in your Xtream server, username and password. This file stays on your machine.
3. Install the toolchain for Tauri 2 on your OS (Rust, Node LTS, pnpm, and the OS prerequisites from the Tauri docs).
4. Open Claude Code in the folder.

## First prompt (paste as is)

```
Read CLAUDE.md, then every file in docs/ and design/README.md. Don't write code yet.

Then:
1. Summarise the plan back to me in 10 lines or fewer, including anything in the docs that looks wrong or contradictory.
2. Ask me the open questions from CLAUDE.md that block M0 and M1 (at least: which OS is primary).
3. After I answer, do M0 from docs/ROADMAP.md. Stop when its acceptance checks pass and report.
```

## Prompts for later milestones

```
Start M1 from docs/ROADMAP.md. Follow docs/DECISIONS.md D2 in order and stop at the first option that passes. Report measured first-frame and zap times, and write the outcome into D2. Stop for review.
```

```
Start M<n> from docs/ROADMAP.md. Match design/screens/<file> for the look. Stop when the acceptance checks pass and report what works, what doesn't, and the measured numbers.
```

## When reviewing a milestone

- Run the app yourself on your subscription; the acceptance checks are the minimum.
- Put design feedback against the mockup ("the channel row is taller than in LiveTV.dc.html") rather than in general terms.
- If you change a decision, ask Claude Code to update `docs/DECISIONS.md` so the next session knows.
