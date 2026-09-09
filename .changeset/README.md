# Changesets

This folder holds pending release notes. Run `pnpm changeset` after a user-facing change,
pick a bump type, and describe the change. On merge to `main`, the release workflow opens
(or updates) a "Version Packages" pull request; merging that PR tags and publishes the release.

See [CONTRIBUTING.md](../CONTRIBUTING.md#releasing) for the full flow.
