# Security

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability reporting on this repository
("Security" tab → "Report a vulnerability"). You'll get an acknowledgement within a few days.

## What this action touches

- Reads repository history through `git` and, when a token is available, the GitHub compare API.
- Downloads a pinned tokei release from `github.com/XAMPPRocky/tokei` over HTTPS and caches it in
  the runner tool cache.
- Writes changed files to a temporary directory under `RUNNER_TEMP` for the duration of the run
  and deletes it afterwards.
- With `comment: true`, creates or edits one issue comment on the pull request.

It never executes code from the repository under analysis.
