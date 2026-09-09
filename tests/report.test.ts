import { describe, expect, it } from "vitest";
import { analyze } from "../src/analyze.js";
import { COMMENT_MARKER, fileRatio, renderMarkdown } from "../src/report.js";
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
      head: [stats("src/a.ts", 210, 6), stats("src/b|c.ts", 90, 0)],
      threshold: 10,
      minCodeLines: 0,
    });
    const markdown = renderMarkdown(analysis, {
      range: { base: "0123456789abcdef", head: "fedcba9876543210" },
      tokeiVersion: "12.1.2",
    });

    expect(markdown.startsWith(COMMENT_MARKER)).toBe(true);
    expect(markdown).toContain("## ❌ Code ↔ Comment Ratio: Failed");
    expect(markdown).toContain("| **Added** | +200 | +1 |");
    expect(markdown).toContain("| **Removed** | −10 | 0 |");
    expect(markdown).toContain("| **Net** | +190 | +1 |");
    expect(markdown).toContain("**Ratio** 200 : 1");
    expect(markdown).toContain("<summary>2 files analyzed</summary>");
    expect(markdown).toContain("| `src/a.ts` | TypeScript | +200 | +1 | 200 ⚠️ |");
    expect(markdown).toContain("| `src/b\\|c.ts` | TypeScript | −10 | 0 | – |");
    expect(markdown).toContain("`0123456…fedcba9`");
    expect(markdown).toContain("tokei) 12.1.2");
    expect(markdown).toMatchSnapshot();
  });

  it("renders a skipped report without a file table", () => {
    const analysis = analyze({ changes: [], base: [], head: [], threshold: 10, minCodeLines: 0 });
    const markdown = renderMarkdown(analysis);
    expect(markdown).toContain("⏭️ Code ↔ Comment Ratio: Skipped");
    expect(markdown).not.toContain("<details>");
  });

  it("truncates long file lists", () => {
    const changes = Array.from({ length: 5 }, (_, i) => modified(`f${i}.ts`));
    const analysis = analyze({
      changes,
      base: [],
      head: changes.map((c) => stats(c.path, 10, 1)),
      threshold: 10,
      minCodeLines: 0,
    });
    const markdown = renderMarkdown(analysis, { maxFiles: 2 });
    expect(markdown).toContain("…and 3 more files.");
  });
});

describe("fileRatio", () => {
  const base = { path: "x", status: "modified", language: "TypeScript" } as const;
  const lines = { code: 0, comments: 0, blanks: 0 };

  it("is undefined when no code was added", () => {
    expect(
      fileRatio({ ...base, base: lines, head: lines, codeDelta: 0, commentsDelta: 3 }),
    ).toBeUndefined();
    expect(
      fileRatio({ ...base, base: lines, head: lines, codeDelta: -4, commentsDelta: 0 }),
    ).toBeUndefined();
  });

  it("ignores removed comments and divides otherwise", () => {
    expect(fileRatio({ ...base, base: lines, head: lines, codeDelta: 10, commentsDelta: -2 })).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(fileRatio({ ...base, base: lines, head: lines, codeDelta: 10, commentsDelta: 4 })).toBe(
      2.5,
    );
  });
});
