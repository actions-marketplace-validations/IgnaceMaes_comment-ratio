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
  /** Share of added lines that are comments, in percent (0-100). */
  density: number;
  /** Maximum allowed density, in percent. */
  maxDensity: number;
  minLinesAdded: number;
  verdict: Verdict;
}

export interface AnalyzeOptions {
  changes: ChangedFile[];
  base: FileStats[];
  head: FileStats[];
  /** Maximum allowed comment density, in percent. */
  maxDensity: number;
  /** Skip the check when fewer lines (code + comments) were added. */
  minLinesAdded: number;
  languageFilter?: LanguageFilter;
}

/**
 * Join per-file counts from both sides of the diff, compute deltas and decide
 * whether the change stays under the comment density limit. Pure: no I/O.
 */
export function analyze(options: AnalyzeOptions): Analysis {
  const { changes, maxDensity, minLinesAdded } = options;
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

  // Most comment-heavy files first so the report leads with the offenders.
  files.sort(
    (a, b) =>
      b.commentsDelta - a.commentsDelta ||
      b.codeDelta - a.codeDelta ||
      a.path.localeCompare(b.path),
  );

  const totals = sumTotals(files);
  const density = commentDensity(totals.codeAdded, totals.commentsAdded);
  const verdict = decide({ totals, density, maxDensity, minLinesAdded });

  return { files, totals, density, maxDensity, minLinesAdded, verdict };
}

/** Comment lines as a percentage of all added lines. 0 when nothing was added. */
export function commentDensity(codeAdded: number, commentsAdded: number): number {
  const total = codeAdded + commentsAdded;
  return total === 0 ? 0 : (commentsAdded / total) * 100;
}

/** Density of a single file's additions, or undefined when it added nothing. */
export function fileDensity(file: FileDelta): number | undefined {
  const code = Math.max(file.codeDelta, 0);
  const comments = Math.max(file.commentsDelta, 0);
  if (code + comments === 0) return undefined;
  return commentDensity(code, comments);
}

function decide(input: {
  totals: Totals;
  density: number;
  maxDensity: number;
  minLinesAdded: number;
}): Verdict {
  const { totals, density, maxDensity, minLinesAdded } = input;
  const linesAdded = totals.codeAdded + totals.commentsAdded;

  if (totals.filesAnalyzed === 0) {
    return { status: "skip", reason: "No files with countable source code changed." };
  }
  if (linesAdded < minLinesAdded) {
    return {
      status: "skip",
      reason:
        `Only ${plural(linesAdded, "line")} added, ` +
        `below the minimum of ${minLinesAdded} for this check to apply.`,
    };
  }
  if (density > maxDensity) {
    return {
      status: "fail",
      reason:
        `${formatPercent(density)} of the added lines are comments ` +
        `(${totals.commentsAdded} of ${linesAdded}); the limit is ${formatPercent(maxDensity)}.`,
    };
  }
  return {
    status: "pass",
    reason:
      `${formatPercent(density)} of the added lines are comments ` +
      `(${totals.commentsAdded} of ${linesAdded}), within the limit of ${formatPercent(maxDensity)}.`,
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

/** `12.5%`, `25%`: one decimal unless the value is a whole number. */
export function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
