import type { LanguageFilter } from "./filter.js";
import { type ChangedFile, type ChangeStatus, EMPTY_STATS, type FileStats } from "./types.js";
import type { LineStats } from "./types.js";

export interface FileDelta {
  path: string;
  previousPath?: string;
  status: ChangeStatus;
  language: string;
  base: LineStats;
  head: LineStats;
  /** head.code - base.code */
  codeDelta: number;
  /** head.comments - base.comments */
  commentsDelta: number;
}

export interface Totals {
  /** Sum of positive per-file code deltas. */
  codeAdded: number;
  /** Sum of positive per-file comment deltas. */
  commentsAdded: number;
  codeRemoved: number;
  commentsRemoved: number;
  netCode: number;
  netComments: number;
  filesAnalyzed: number;
}

export type VerdictStatus = "pass" | "fail" | "skip";

export interface Verdict {
  status: VerdictStatus;
  /** Human-readable explanation, safe to show in a comment. */
  reason: string;
}

export interface Analysis {
  files: FileDelta[];
  totals: Totals;
  /** Code lines added per comment line added. `Infinity` when no comments were added. */
  ratio: number;
  threshold: number;
  minCodeLines: number;
  verdict: Verdict;
}

export interface AnalyzeOptions {
  changes: ChangedFile[];
  base: FileStats[];
  head: FileStats[];
  threshold: number;
  minCodeLines: number;
  languageFilter?: LanguageFilter;
}

/**
 * Join per-file counts from both sides of the diff, compute deltas and decide
 * whether the change clears the threshold. Pure: no I/O, easy to test.
 */
export function analyze(options: AnalyzeOptions): Analysis {
  const { changes, threshold, minCodeLines } = options;
  const languageFilter = options.languageFilter ?? (() => true);
  const baseStats = indexByPath(options.base);
  const headStats = indexByPath(options.head);

  const files: FileDelta[] = [];
  for (const change of changes) {
    const basePath = change.previousPath ?? change.path;
    const base = baseStats.get(basePath);
    const head = headStats.get(change.path);
    // tokei did not recognize the file on either side (binary, unknown extension...).
    if (!base && !head) continue;

    const language = head?.language ?? base?.language ?? "Unknown";
    if (!languageFilter(language)) continue;

    const baseLines = toLineStats(base);
    const headLines = toLineStats(head);
    const delta: FileDelta = {
      path: change.path,
      status: change.status,
      language,
      base: baseLines,
      head: headLines,
      codeDelta: headLines.code - baseLines.code,
      commentsDelta: headLines.comments - baseLines.comments,
    };
    if (change.previousPath !== undefined) delta.previousPath = change.previousPath;
    files.push(delta);
  }

  files.sort((a, b) => b.codeDelta - a.codeDelta || a.path.localeCompare(b.path));

  const totals = sumTotals(files);
  const ratio = computeRatio(totals.codeAdded, totals.commentsAdded);
  const verdict = decide({ totals, ratio, threshold, minCodeLines });

  return { files, totals, ratio, threshold, minCodeLines, verdict };
}

export function computeRatio(codeAdded: number, commentsAdded: number): number {
  if (codeAdded === 0) return 0;
  if (commentsAdded === 0) return Number.POSITIVE_INFINITY;
  return codeAdded / commentsAdded;
}

/** Ratio of comment lines to all added lines, as a percentage for display. */
export function commentPercentage(codeAdded: number, commentsAdded: number): number {
  const total = codeAdded + commentsAdded;
  return total === 0 ? 0 : (commentsAdded / total) * 100;
}

function decide(input: {
  totals: Totals;
  ratio: number;
  threshold: number;
  minCodeLines: number;
}): Verdict {
  const { totals, ratio, threshold, minCodeLines } = input;

  if (totals.filesAnalyzed === 0) {
    return { status: "skip", reason: "No files with countable source code changed." };
  }
  if (totals.codeAdded < minCodeLines) {
    return {
      status: "skip",
      reason:
        `Only ${plural(totals.codeAdded, "line")} of code added, ` +
        `below the minimum of ${minCodeLines} for this check to apply.`,
    };
  }
  if (ratio > threshold) {
    const detail =
      totals.commentsAdded === 0
        ? `${plural(totals.codeAdded, "line")} of code were added without a single comment line.`
        : `${formatRatio(ratio)} lines of code were added per comment line; the limit is ${formatRatio(threshold)}.`;
    return { status: "fail", reason: detail };
  }
  return {
    status: "pass",
    reason: `${formatRatio(ratio)} lines of code per comment line, within the limit of ${formatRatio(threshold)}.`,
  };
}

function sumTotals(files: FileDelta[]): Totals {
  const totals: Totals = {
    codeAdded: 0,
    commentsAdded: 0,
    codeRemoved: 0,
    commentsRemoved: 0,
    netCode: 0,
    netComments: 0,
    filesAnalyzed: files.length,
  };
  for (const file of files) {
    totals.codeAdded += Math.max(file.codeDelta, 0);
    totals.codeRemoved += Math.max(-file.codeDelta, 0);
    totals.commentsAdded += Math.max(file.commentsDelta, 0);
    totals.commentsRemoved += Math.max(-file.commentsDelta, 0);
    totals.netCode += file.codeDelta;
    totals.netComments += file.commentsDelta;
  }
  return totals;
}

function indexByPath(stats: FileStats[]): Map<string, FileStats> {
  return new Map(stats.map((entry) => [entry.path, entry]));
}

function toLineStats(stats: FileStats | undefined): LineStats {
  if (!stats) return { ...EMPTY_STATS };
  return { code: stats.code, comments: stats.comments, blanks: stats.blanks };
}

/** Format a ratio for humans: `∞`, integers without decimals, otherwise one decimal. */
export function formatRatio(ratio: number): string {
  if (!Number.isFinite(ratio)) return "∞";
  if (Number.isInteger(ratio)) return String(ratio);
  return ratio.toFixed(1);
}

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
