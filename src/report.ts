import { type Analysis, type FileDelta, fileRatio, formatPercent } from "./analyze.js";

/** Hidden marker used to find and update the sticky pull request comment. */
export const COMMENT_MARKER = "<!-- comment-ratio -->";

export interface ReportOptions {
  /** Maximum number of files listed in the per-file table. */
  maxFiles?: number;
  /** Full SHAs of the compared commits, shown abbreviated in the footer. */
  range?: { base: string; head: string };
  /** Version string reported by tokei, shown in the footer. */
  tokeiVersion?: string;
}

const STATUS_LABEL = {
  pass: { icon: "✅", text: "Passed" },
  fail: { icon: "❌", text: "Failed" },
  skip: { icon: "⏭️", text: "Skipped" },
} as const;

/** Render the analysis as GitHub-flavored Markdown for comments and job summaries. */
export function renderMarkdown(analysis: Analysis, options: ReportOptions = {}): string {
  const { totals, ratio, maxRatio, verdict } = analysis;
  const label = STATUS_LABEL[verdict.status];
  const maxFiles = options.maxFiles ?? 50;

  const lines: string[] = [];
  lines.push(COMMENT_MARKER);
  lines.push(`## ${label.icon} Comment Ratio: ${label.text}`);
  lines.push("");
  lines.push(verdict.reason);
  lines.push("");
  lines.push("| | Code | Comments |");
  lines.push("|:--|--:|--:|");
  lines.push(`| **Added** | ${signed(totals.codeAdded)} | ${signed(totals.commentsAdded)} |`);
  lines.push(
    `| **Removed** | ${signed(-totals.codeRemoved)} | ${signed(-totals.commentsRemoved)} |`,
  );
  lines.push(`| **Net** | ${signed(totals.netCode)} | ${signed(totals.netComments)} |`);
  lines.push("");
  lines.push(
    `**Comment ratio** ${formatPercent(ratio)} &nbsp;·&nbsp; **Limit** ${formatPercent(maxRatio)}`,
  );

  if (analysis.files.length > 0) {
    lines.push("");
    lines.push(renderFileTable(analysis.files, maxRatio, maxFiles));
  }

  lines.push("");
  lines.push(renderFooter(options));
  return `${lines.join("\n")}\n`;
}

function renderFileTable(files: FileDelta[], maxRatio: number, maxFiles: number): string {
  const shown = files.slice(0, maxFiles);
  const hidden = files.length - shown.length;
  const lines: string[] = [];
  lines.push("<details>");
  lines.push(`<summary>${files.length} file${files.length === 1 ? "" : "s"} analyzed</summary>`);
  lines.push("");
  lines.push("| File | Language | Code Δ | Comments Δ | Ratio |");
  lines.push("|:--|:--|--:|--:|--:|");
  for (const file of shown) {
    const name = file.previousPath ? `${file.previousPath} → ${file.path}` : file.path;
    const ratio = fileRatio(file);
    const flag = ratio !== undefined && ratio > maxRatio ? " ⚠️" : "";
    lines.push(
      `| \`${escapePipes(name)}\` | ${file.language} | ${signed(file.codeDelta)} | ` +
        `${signed(file.commentsDelta)} | ${ratio === undefined ? "–" : formatPercent(ratio)}${flag} |`,
    );
  }
  if (hidden > 0) {
    lines.push("");
    lines.push(`…and ${hidden} more file${hidden === 1 ? "" : "s"}.`);
  }
  lines.push("");
  lines.push("</details>");
  return lines.join("\n");
}

function renderFooter(options: ReportOptions): string {
  const parts: string[] = [];
  if (options.range) {
    parts.push(`comparing \`${options.range.base.slice(0, 7)}…${options.range.head.slice(0, 7)}\``);
  }
  parts.push(
    `counted with [tokei](https://github.com/XAMPPRocky/tokei)${options.tokeiVersion ? ` ${options.tokeiVersion}` : ""}`,
  );
  return `<sub>The ratio is the share of comment lines among all lines added. Lines are counted per changed file before and after the change; positive deltas are summed. ${capitalize(parts.join(", "))}.</sub>`;
}

function signed(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return "0";
}

function escapePipes(text: string): string {
  return text.replace(/\|/g, "\\|");
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
