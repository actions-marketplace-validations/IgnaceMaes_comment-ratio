import { describe, expect, it } from "vitest";
import { analyze } from "../src/analyze.js";
import { COMMENT_MARKER, renderMarkdown } from "../src/report.js";
import type { ChangedFile, FileStats } from "../src/types.js";

const stats = (path: string, code: number, comments: number): FileStats => ({
  path,
  language: "TypeScript",
  code,
  comments,
  blanks: 0,
});

const modified = (path: string): ChangedFile => ({
  status: "modified",
  path,
  baseOid: "a".repeat(40),
  headOid: "b".repeat(40),
});

describe("renderMarkdown", () => {
  it("renders a failing report with totals, files and footer", () => {
    const analysis = analyze({
      changes: [modified("src/a.ts"), modified("src/b|c.ts")],
      base: [stats("src/a.ts", 10, 5), stats("src/b|c.ts", 100, 0)],
      head: [stats("src/a.ts", 110, 105), stats("src/b|c.ts", 90, 0)],
      maxRatio: 0.25,
      minLinesAdded: 0,
    });
    const markdown = renderMarkdown(analysis, {
      range: { base: "0123456789abcdef", head: "fedcba9876543210" },
      tokeiVersion: "12.1.2",
    });

    expect(markdown.startsWith(COMMENT_MARKER)).toBe(true);
    expect(markdown).toContain("## ❌ Comment Ratio: Failed");
    expect(markdown).toContain("| **Added** | +100 | +100 |");
    expect(markdown).toContain("| **Removed** | −10 | 0 |");
    expect(markdown).toContain("| **Net** | +90 | +100 |");
    expect(markdown).toContain("**Comment ratio** 50% &nbsp;·&nbsp; **Limit** 25%");
    expect(markdown).toContain("<summary>2 files analyzed</summary>");
    expect(markdown).toContain("| `src/a.ts` | TypeScript | +100 | +100 | 50% ⚠️ |");
    expect(markdown).toContain("| `src/b\\|c.ts` | TypeScript | −10 | 0 | – |");
    expect(markdown).toContain("`0123456…fedcba9`");
    expect(markdown).toContain("tokei) 12.1.2");
    expect(markdown).toMatchSnapshot();
  });

  it("renders a skipped report without a file table", () => {
    const analysis = analyze({ changes: [], base: [], head: [], maxRatio: 0.25, minLinesAdded: 0 });
    const markdown = renderMarkdown(analysis);
    expect(markdown).toContain("⏭️ Comment Ratio: Skipped");
    expect(markdown).not.toContain("<details>");
  });

  it("truncates long file lists", () => {
    const changes = Array.from({ length: 5 }, (_, i) => modified(`f${i}.ts`));
    const analysis = analyze({
      changes,
      base: [],
      head: changes.map((c) => stats(c.path, 10, 1)),
      maxRatio: 0.25,
      minLinesAdded: 0,
    });
    const markdown = renderMarkdown(analysis, { maxFiles: 2 });
    expect(markdown).toContain("…and 3 more files.");
  });
});
