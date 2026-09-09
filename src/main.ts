import { mkdtemp, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as core from "@actions/core";
import * as github from "@actions/github";
import { analyze, type Analysis, formatRatio } from "./analyze.js";
import { upsertComment } from "./comment.js";
import { createLanguageFilter, createPathFilter } from "./filter.js";
import { listChangedFiles, materialize } from "./git.js";
import { type Inputs, parseInputs } from "./inputs.js";
import { rangeFromContext, resolveRange } from "./range.js";
import { fileRatio, renderMarkdown } from "./report.js";
import { resolveTokei, tokeiVersion } from "./tokei/install.js";
import { countDirectory } from "./tokei/run.js";

const MAX_FILE_ANNOTATIONS = 10;

export async function run(): Promise<void> {
  const inputs = parseInputs((name) => core.getInput(name));
  const octokit = inputs.githubToken ? github.getOctokit(inputs.githubToken) : undefined;
  const { context } = github;

  const range = rangeFromContext(context, inputs);
  if (!range) {
    core.info("Nothing to compare for this event (first push of a branch); skipping.");
    setOutputs(undefined);
    return;
  }

  const binary = await core.group("Install tokei", () => resolveTokei(inputs.tokeiVersion));
  const version = await tokeiVersion(binary);
  core.info(version);

  const resolved = await core.group("Resolve commit range", () =>
    resolveRange(range, context.repo, octokit),
  );
  core.info(`Comparing ${resolved.mergeBase.slice(0, 7)}...${resolved.head.slice(0, 7)}`);

  const pathFilter = createPathFilter(inputs.include, inputs.exclude);
  const allChanges = await listChangedFiles(resolved.mergeBase, resolved.head);
  const changes = allChanges.filter((file) => pathFilter(file.path));
  core.info(
    `${changes.length} changed file${changes.length === 1 ? "" : "s"} to analyze` +
      (allChanges.length !== changes.length
        ? ` (${allChanges.length - changes.length} excluded by include/exclude)`
        : ""),
  );

  const workDir = await mkdtemp(path.join(process.env.RUNNER_TEMP ?? os.tmpdir(), "ccrl-"));
  let analysis: Analysis;
  try {
    const snapshot = await materialize(changes, workDir);
    const [base, head] = await Promise.all([
      countDirectory(binary, snapshot.baseDir),
      countDirectory(binary, snapshot.headDir),
    ]);
    analysis = analyze({
      changes,
      base,
      head,
      threshold: inputs.threshold,
      minCodeLines: inputs.minCodeLines,
      languageFilter: createLanguageFilter(inputs.languages, inputs.excludeLanguages),
    });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }

  const report = renderMarkdown(analysis, {
    range: { base: resolved.mergeBase, head: resolved.head },
    tokeiVersion: parseVersion(version),
  });

  setOutputs(analysis, report);
  await core.summary.addRaw(report).write();
  await publishComment(inputs, octokit, report);
  conclude(inputs, analysis);
}

function setOutputs(analysis: Analysis | undefined, report = ""): void {
  core.setOutput("code-added", analysis?.totals.codeAdded ?? 0);
  core.setOutput("comments-added", analysis?.totals.commentsAdded ?? 0);
  core.setOutput("ratio", analysis ? formatRatioOutput(analysis.ratio) : "0");
  core.setOutput("status", analysis?.verdict.status ?? "skip");
  core.setOutput("passed", analysis ? String(analysis.verdict.status !== "fail") : "true");
  core.setOutput("report", report);
}

/** `tokei 12.1.2 compiled with ...` -> `12.1.2` */
function parseVersion(versionOutput: string): string {
  return versionOutput.replace(/^tokei\s+/, "").split(/\s+/)[0] ?? versionOutput;
}

function formatRatioOutput(ratio: number): string {
  return Number.isFinite(ratio) ? ratio.toFixed(2) : "Infinity";
}

async function publishComment(
  inputs: Inputs,
  octokit: ReturnType<typeof github.getOctokit> | undefined,
  body: string,
): Promise<void> {
  if (!inputs.comment) return;
  const issueNumber = github.context.payload.pull_request?.number;
  if (issueNumber === undefined) {
    core.info("Not a pull request event; skipping the comment.");
    return;
  }
  if (!octokit) {
    core.warning("No github-token provided; skipping the pull request comment.");
    return;
  }
  try {
    await upsertComment(octokit, { ...github.context.repo, issueNumber }, body);
  } catch (error) {
    // Forked pull requests only get a read-only token; that must not fail the check.
    core.warning(`Could not post the pull request comment: ${describe(error)}`);
  }
}

function conclude(inputs: Inputs, analysis: Analysis): void {
  const { verdict, totals, ratio, threshold } = analysis;
  const headline =
    `${totals.codeAdded} code lines and ${totals.commentsAdded} comment lines added ` +
    `(ratio ${formatRatio(ratio)}, threshold ${formatRatio(threshold)})`;

  switch (verdict.status) {
    case "pass":
      core.info(`✅ ${headline}`);
      return;
    case "skip":
      core.info(`⏭️ ${verdict.reason}`);
      return;
    case "fail": {
      annotateWorstFiles(analysis);
      const message = `Comment ratio check failed: ${verdict.reason}`;
      if (inputs.failOnThreshold) {
        core.setFailed(message);
      } else {
        core.warning(`${message} (fail-on-threshold is false, not failing the job)`);
      }
      return;
    }
    default:
      return;
  }
}

/** Point reviewers at the files that contributed most to the failure. */
function annotateWorstFiles(analysis: Analysis): void {
  const offenders = analysis.files
    .filter((file) => {
      const ratio = fileRatio(file);
      return ratio !== undefined && ratio > analysis.threshold;
    })
    .slice(0, MAX_FILE_ANNOTATIONS);
  for (const file of offenders) {
    const ratio = fileRatio(file) ?? 0;
    core.warning(
      `+${file.codeDelta} code / +${Math.max(file.commentsDelta, 0)} comment lines ` +
        `(ratio ${formatRatio(ratio)}, threshold ${formatRatio(analysis.threshold)})`,
      { file: file.path, title: "Sparse comments" },
    );
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

run().catch((error: unknown) => {
  core.setFailed(describe(error));
});
