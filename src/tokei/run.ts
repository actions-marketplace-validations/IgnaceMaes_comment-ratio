import * as path from "node:path";
import { getExecOutput } from "@actions/exec";
import type { FileStats, LineStats } from "../types.js";

export class TokeiRunError extends Error {
  override name = "TokeiRunError";
}

/**
 * Count every file under `root` with tokei and return per-file statistics.
 *
 * Hidden files and ignore files are deliberately not honored: the caller has
 * already decided which files matter by materializing them into `root`.
 */
export async function countDirectory(binary: string, root: string): Promise<FileStats[]> {
  const args = ["--output", "json", "--files", "--hidden", "--no-ignore", root];
  const { exitCode, stdout, stderr } = await getExecOutput(binary, args, {
    silent: true,
    ignoreReturnCode: true,
  });
  if (exitCode !== 0) {
    throw new TokeiRunError(`tokei exited with code ${exitCode}: ${stderr.trim()}`);
  }
  return parseTokeiJson(stdout, root);
}

/* tokei's JSON output, reduced to the fields this action relies on. */
interface TokeiStats {
  code: number;
  comments: number;
  blanks: number;
  /** Embedded languages (e.g. JavaScript inside HTML), keyed by language name. */
  blobs?: Record<string, TokeiStats>;
}

interface TokeiReport {
  name: string;
  stats: TokeiStats;
}

interface TokeiLanguage {
  reports?: TokeiReport[];
}

/**
 * Parse `tokei --output json --files` output into a flat list of files.
 *
 * Paths are returned relative to `root` with forward slashes. Embedded-language
 * blobs are folded into their parent file so that one file yields one record.
 */
export function parseTokeiJson(json: string, root: string): FileStats[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json.trim() === "" ? "{}" : json);
  } catch (error) {
    throw new TokeiRunError(`tokei produced invalid JSON: ${(error as Error).message}`);
  }
  if (!isRecord(parsed)) {
    throw new TokeiRunError("tokei produced unexpected JSON (expected an object)");
  }

  const files: FileStats[] = [];
  for (const [language, value] of Object.entries(parsed)) {
    // "Total" duplicates every report under `children`; skip it.
    if (language === "Total" || !isRecord(value)) continue;
    const reports = (value as TokeiLanguage).reports ?? [];
    for (const report of reports) {
      if (!isRecord(report) || typeof report.name !== "string" || !isRecord(report.stats)) {
        continue;
      }
      files.push({
        path: relativePosix(root, report.name),
        language,
        ...summarise(report.stats as unknown as TokeiStats),
      });
    }
  }
  return files;
}

/** Fold embedded-language blobs into the parent totals, like tokei's CLI table does. */
export function summarise(stats: TokeiStats): LineStats {
  let code = stats.code ?? 0;
  let comments = stats.comments ?? 0;
  let blanks = stats.blanks ?? 0;
  for (const blob of Object.values(stats.blobs ?? {})) {
    const nested = summarise(blob);
    code += nested.code;
    comments += nested.comments;
    blanks += nested.blanks;
  }
  return { code, comments, blanks };
}

function relativePosix(root: string, file: string): string {
  const relative = path.relative(path.resolve(root), path.resolve(file));
  return relative.split(path.sep).join("/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
