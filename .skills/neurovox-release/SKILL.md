---
name: neurovox-release
description: Version bump and GitHub Actions release for the NeuroVox Obsidian plugin. Use when the user wants to cut a release, bump the version, or publish a new version after stable changes are ready.
---

# NeuroVox Release

Handles version bumping and tag-driven GitHub release creation for the NeuroVox Obsidian plugin
(repo: `Synaptic-Labs-AI/NeuroVox`).

## When to Use This Skill

Use when the user:
- Asks to "release", "publish", "bump version", or "cut a release"
- Says changes are stable and ready to ship
- Asks about the release process

## Pre-Flight Checks

Before releasing, verify:
1. The release changes are merged into `main`
2. You are on `main`
3. `git pull --ff-only origin main` succeeds
4. No unrelated uncommitted changes are present
5. `npm run build` passes clean (this runs `tsc -noEmit` + `eslint src` + esbuild)
6. `npm test` passes (WavSplitter unit tests)

Do not release from a feature branch. Do not create a release manually from local build
artifacts unless the tag workflow failed and the user explicitly approves a fallback.

## Release Steps

### 1. Determine Version Bump

Ask the user if not specified:
- **Patch** (x.x.+1): Bug fixes, compliance fixes, small improvements
- **Minor** (x.+1.0): New non-breaking features
- **Major** (+1.0.0): Breaking changes

Current released version is in `manifest.json` (`version`). Recent tags: `1.0.2`, `1.0.3`, `1.0.4`.

### 2. Bump Version (keeps 3 files in sync automatically)

NeuroVox has a working `version-bump.mjs` wired to the `version` npm script, so use `npm version`.
It sets `package.json`, then `version-bump.mjs` syncs `manifest.json` and `versions.json`
(adding a `"X.Y.Z": "<minAppVersion>"` entry). Skip the auto git commit/tag so the skill controls those:

```bash
npm version X.Y.Z --no-git-tag-version
```

After it runs, confirm all three are in sync:

```text
package.json   -> "version": "X.Y.Z"
manifest.json  -> "version": "X.Y.Z"
versions.json  -> has a "X.Y.Z" entry
```

Optional: `CLAUDE.md` has a prose "**Version**: ..." line that has historically drifted — update it
if you want it accurate, but it is not consumed by the build or release.

### 3. Rebuild

Rebuild after the version bump so the bundled `main.js` is current:

```bash
npm run build
```

Check the generated artifact sizes:

```bash
ls -la main.js manifest.json styles.css
```

`main.js` should stay well below 5 MB for Obsidian Sync Standard compatibility (currently ~340 KB).

### 4. Commit and Push Main

Stage only the version-bump files:

```bash
git add package.json manifest.json versions.json
git commit -m "chore: bump version to X.Y.Z"
git push origin main
```

### 5. Create and Push the Release Tag

The GitHub Actions release workflow (`.github/workflows/release.yml`) runs on version tags,
rebuilds from the tag, validates the version metadata, and creates the release.

```bash
git tag X.Y.Z
git push origin X.Y.Z
```

Release title rule: the GitHub release name must be the tag number only, with no `v` prefix and
no descriptive suffix. Example: `1.1.0`. (The workflow sets `name: ${{ github.ref_name }}` for this.)

### 6. Verify GitHub Actions Release

The workflow must:
- Validate that the tag matches `manifest.json` and `package.json` versions and that `versions.json`
  has an entry for the tag (it fails the release if any are out of sync)
- Build from the tag in GitHub Actions (`npm ci` + `npm run build`)
- Upload only the 3 Obsidian-supported release assets: `main.js`, `manifest.json`, `styles.css`
- Generate artifact attestations for the uploaded assets

After the workflow completes, verify the GitHub release contains only those 3 assets.

## NeuroVox-Specific Gotchas

- **Never commit or ship the top-level `wasm/` folder** (~22.5 MB `ort-wasm-*` files). It is an
  orphaned leftover, is referenced by nothing (transformers.js pulls onnx from a CDN at runtime),
  and would blow past Obsidian Sync limits. Keep it out of `git` and out of release assets.
- **The local-model (Moonshine) feature is intentionally hidden** from the UI while in development
  (commented-out UI call sites in `ModelHookupAccordion.ts` and `RecordingAccordion.ts`). The
  adapter/loader code is still compiled in. Do not "fix" or re-expose it as part of a release.
- The release assets list is exactly `main.js`, `manifest.json`, `styles.css` — no `versions.json`
  in the release (it lives in the repo for Obsidian's update mechanism, not as a download).

## Release Artifacts Checklist

| File | Purpose |
|------|---------|
| `main.js` | Plugin bundle (esbuild output) |
| `manifest.json` | Obsidian plugin manifest |
| `styles.css` | Plugin styles |

## Common Mistakes to Avoid

- Releasing from a feature branch instead of `main`
- Forgetting to pull latest `main` before the version bump
- Editing only one or two of the version files (use `npm version X.Y.Z --no-git-tag-version` so all three stay in sync)
- Forgetting to rebuild after the version bump
- Tagging with a `v` prefix (tags and release names are bare numbers: `1.1.0`)
- Committing the `wasm/` folder or attaching unsupported release artifacts
- Manually creating a release in a way that bypasses artifact attestations
