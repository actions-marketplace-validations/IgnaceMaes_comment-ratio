# Contributing

Thanks for helping out. This is a small TypeScript project with a deliberately small toolchain.

## Setup

Requirements: Node 24 (see `.node-version`) and [pnpm](https://pnpm.io) (`corepack enable` picks the
pinned version up from `package.json`). tokei only needs to be installed locally if you want to
run the action end to end; the unit tests use recorded fixtures.

```sh
pnpm install
pnpm check      # lint + typecheck + test + build
```

| Script           | What it does                                                   |
| :--------------- | :------------------------------------------------------------- |
| `pnpm test`      | Vitest unit tests (`tests/`)                                   |
| `pnpm lint`      | [oxlint](https://oxc.rs/docs/guide/usage/linter) + oxfmt check |
| `pnpm lint:fix`  | Auto-fix lint issues and format                                |
| `pnpm typecheck` | `tsc --noEmit` (TypeScript 7)                                  |
| `pnpm build`     | Bundle `src/main.ts` into `dist/index.js` with tsdown          |
| `pnpm changeset` | Record a release note for your change                          |

## Project layout

```
action.yml          Action metadata: inputs, outputs, runtime
src/main.ts         Entry point; wires the steps together
src/inputs.ts       Input parsing and validation
src/range.ts        Which commits to compare, merge-base resolution
src/git.ts          Changed-file listing and blob materialization
src/tokei/          Download/cache tokei and parse its JSON
src/filter.ts       Include/exclude globs and language filters
src/analyze.ts      Pure delta/ratio/verdict computation
src/report.ts       Markdown rendering
src/comment.ts      Sticky pull request comment
dist/index.js       Bundled output, committed (see below)
tests/              Vitest specs and tokei fixtures
```

Everything with side effects lives in `main.ts`, `git.ts`, `tokei/install.ts` and `comment.ts`.
The rest is pure and unit-tested.

## `dist/` is committed

GitHub runs JavaScript actions straight from the repository without installing dependencies,
so the bundled `dist/index.js` must be checked in. CI fails if it is stale:

```sh
pnpm build
git add dist
```

`dist/**` is marked `linguist-generated` and `-diff` in `.gitattributes`, so it stays collapsed in
reviews.

## Trying it locally

The action reads its inputs from `INPUT_*` environment variables and the event from
`GITHUB_EVENT_PATH`, so you can run the bundle against any local repository:

```sh
cd path/to/some/repo
echo '{"pull_request":{"number":1,"base":{"sha":"<base>"},"head":{"sha":"<head>"}}}' > /tmp/event.json
env GITHUB_EVENT_NAME=pull_request GITHUB_EVENT_PATH=/tmp/event.json \
    GITHUB_REPOSITORY=acme/demo GITHUB_OUTPUT=/tmp/out.txt \
    INPUT_COMMENT=false "INPUT_TOKEI-VERSION=system" "INPUT_MAX-COMMENT-RATIO=0.05" \
    node path/to/comment-ratio/dist/index.js
```

## Pull requests

1. Add or update tests for behavior changes.
2. Run `pnpm check`.
3. Run `pnpm changeset` if users would notice the change, and commit the generated file.
4. Rebuild and commit `dist/`.

## Marketplace listing

Publishing to GitHub Marketplace is a **one-time manual step** and cannot be automated: the
"Publish this Action to the GitHub Marketplace" checkbox and its category dropdowns exist only in
the release-draft web UI, and neither `action.yml` nor the REST releases API can set them. Because
the Release workflow below creates releases through the API, the first release has to be drafted by
hand at **Releases → Draft a new release**:

1. Tick **Publish this Action to the GitHub Marketplace** (requires accepting the Marketplace terms).
2. **Primary Category:** `Code quality`
3. **Another Category:** `Code review`

Categories and the `description` in `action.yml` are what Marketplace search matches on, so keep the
description keyword-bearing and leave the categories alone on later releases; subsequent releases
inherit the listing.

## Releasing

Releases are driven by [changesets](https://github.com/changesets/changesets):

1. Pull requests carry changeset files describing their user-facing changes.
2. On every push to `main`, the **Release** workflow collects pending changesets into a
   "chore: version packages" pull request that bumps `package.json` and `CHANGELOG.md`.
3. Merging that pull request runs `changeset tag`, which creates the `vX.Y.Z` tag. The workflow
   then publishes a GitHub Release with the changelog section and moves the floating major tag
   (`v1`) so `uses: ...@v1` picks the new version up.

Requirements on the repository: under **Settings → Actions → General**, allow GitHub Actions to
create and approve pull requests. Note that CI does not run on pull requests opened with the
default `GITHUB_TOKEN`; the version PR only touches `package.json` and `CHANGELOG.md`, so this is
acceptable, but you can supply a GitHub App or PAT token to the changesets step if you want checks
there too.
