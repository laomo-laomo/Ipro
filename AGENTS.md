# Agent Instructions

This project is edited by multiple agents and humans. Read this file before making changes.

## Required Handoff Log

Before changing code, read `CHANGELOG.md`, especially the newest entries under `Unreleased`, to understand recent changes, touched files, validation status, and known risks.

After every code, config, documentation, dependency, database, or behavior change, add a new entry at the top of `CHANGELOG.md` under `Unreleased`.

Use this exact format:

```md
### YYYY-MM-DD HH:mm +08:00 - Author
- Summary: one sentence describing the change.
- Changed: feature/behavior/code paths touched.
- Files: `path/to/file`, `path/to/other-file`.
- Validation: commands run or `Not run` with reason.
- Risks/Next: known risks, follow-up, or `None`.
```

Author should be `Codex`, `MiniMax`, or the human editor name.

## What To Record

Record these changes:

- New features, bug fixes, behavior changes, route/API changes, UI changes.
- File additions, deletions, renames, migrations, generated assets that are intentionally committed.
- Dependency, package script, build config, environment example, database schema, or seed changes.
- Test/build commands run and whether they passed or failed.
- Known risks, incomplete work, follow-up tasks, or compatibility concerns.

Do not record secrets, tokens, full `.env` values, large logs, or local-only generated files.

## Cleanup/Delete Safety

Treat cleanup as a risky change. Before deleting, moving, or newly ignoring files, classify the targets with `git status --short`, `git status --ignored --short`, and `git ls-files -- <path>` when practical.

- Never delete tracked files as part of workspace cleanup unless the user explicitly asked to remove those project assets, or you have inspected the file and can explain why it is obsolete.
- Do not bulk-delete root-level scripts, JSON fixtures, PDFs, images, or debug notes just because their names look temporary. If they might be useful diagnostics, move them to a named scratch/archive location or ask first.
- Do not add broad `.gitignore` rules that hide existing tracked or recently restored files. Check whether the pattern would hide intentional artifacts before committing it.
- Build caches, dependency folders, runtime logs, and generated directories such as `.next/`, `dist/`, `node_modules/`, and `*.log` can be cleaned when needed, but mention the exact scope in `CHANGELOG.md`.
- If a cleanup deletes anything, record whether each class was tracked, ignored, or untracked in the `CHANGELOG.md` entry, and include recovery notes when relevant.
- After cleanup, run `git status --short --ignored` for the touched paths so hidden restored files are not mistaken for missing files later.

## Quick Start For MiniMax

1. Open `AGENTS.md` first.
2. Read `CHANGELOG.md` newest entries under `Unreleased`.
3. Make the requested changes.
4. Run relevant validation when practical.
5. Add a `CHANGELOG.md` entry before handing back.

## Current Project Commands

- API build: `npm run build --workspace=apps/api`
- Web build: `npm run build --workspace=apps/web`
- Full build: `npm run build`
- Dev API: `npm run dev:api`
- Dev Web: `npm run dev:web`
