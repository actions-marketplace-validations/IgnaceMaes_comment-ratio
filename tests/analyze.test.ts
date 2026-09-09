import { describe, expect, it } from "vitest";
import { analyze, commentPercentage, computeRatio, formatRatio } from "../src/analyze.js";
import { createLanguageFilter } from "../src/filter.js";
import type { ChangedFile, FileStats } from "../src/types.js";

const stats = (
  path: string,
  code: number,
  comments: number,
  language = "TypeScript",
): FileStats => ({
  path,
  language,
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

describe("analyze", () => {
  it("sums positive per-file deltas and passes under the threshold", () => {
    const analysis = analyze({
      changes: [modified("a.ts"), modified("b.ts")],
      base: [stats("a.ts", 100, 10), stats("b.ts", 50, 5)],
      head: [stats("a.ts", 180, 20), stats("b.ts", 30, 2)],
      threshold: 10,
      minCodeLines: 0,
    });
    expect(analysis.totals).toEqual({
      codeAdded: 80,
      commentsAdded: 10,
      codeRemoved: 20,
      commentsRemoved: 3,
      netCode: 60,
      netComments: 7,
      filesAnalyzed: 2,
    });
    expect(analysis.ratio).toBe(8);
    expect(analysis.verdict.status).toBe("pass");
  });

  it("fails when the ratio exceeds the threshold", () => {
    const analysis = analyze({
      changes: [modified("a.ts")],
      base: [stats("a.ts", 0, 0)],
      head: [stats("a.ts", 120, 4)],
      threshold: 10,
      minCodeLines: 0,
    });
    expect(analysis.ratio).toBe(30);
    expect(analysis.verdict).toEqual({
      status: "fail",
      reason: "30 lines of code were added per comment line; the limit is 10.",
    });
  });

  it("fails with an infinite ratio when no comments were added", () => {
    const analysis = analyze({
      changes: [{ status: "added", path: "new.ts", headOid: "b".repeat(40) }],
      base: [],
      head: [stats("new.ts", 75, 0)],
      threshold: 10,
      minCodeLines: 0,
    });
    expect(analysis.ratio).toBe(Number.POSITIVE_INFINITY);
    expect(analysis.verdict.status).toBe("fail");
    expect(analysis.verdict.reason).toContain("without a single comment line");
  });

  it("skips small changes below min-code-lines", () => {
    const analysis = analyze({
      changes: [modified("a.ts")],
      base: [stats("a.ts", 0, 0)],
      head: [stats("a.ts", 20, 0)],
      threshold: 10,
      minCodeLines: 50,
    });
    expect(analysis.verdict.status).toBe("skip");
    expect(analysis.verdict.reason).toContain("Only 20 lines of code added");
  });

  it("skips when nothing countable changed", () => {
    const analysis = analyze({
      changes: [modified("image.png")],
      base: [],
      head: [],
      threshold: 10,
      minCodeLines: 0,
    });
    expect(analysis.files).toEqual([]);
    expect(analysis.verdict.status).toBe("skip");
  });

  it("matches renamed files across their old and new paths", () => {
    const analysis = analyze({
      changes: [
        {
          status: "renamed",
          path: "new/name.ts",
          previousPath: "old/name.ts",
          baseOid: "a".repeat(40),
          headOid: "b".repeat(40),
        },
      ],
      base: [stats("old/name.ts", 100, 10)],
      head: [stats("new/name.ts", 110, 10)],
      threshold: 10,
      minCodeLines: 0,
    });
    expect(analysis.files[0]).toMatchObject({
      path: "new/name.ts",
      previousPath: "old/name.ts",
      codeDelta: 10,
      commentsDelta: 0,
    });
  });

  it("treats deleted files as pure removals", () => {
    const analysis = analyze({
      changes: [{ status: "deleted", path: "gone.ts", baseOid: "a".repeat(40) }],
      base: [stats("gone.ts", 40, 4)],
      head: [],
      threshold: 10,
      minCodeLines: 0,
    });
    expect(analysis.totals).toMatchObject({ codeAdded: 0, codeRemoved: 40, commentsRemoved: 4 });
    expect(analysis.ratio).toBe(0);
    expect(analysis.verdict.status).toBe("pass");
  });

  it("applies the language filter using the head language", () => {
    const analysis = analyze({
      changes: [modified("README.md"), modified("a.ts")],
      base: [stats("README.md", 0, 10, "Markdown"), stats("a.ts", 0, 0)],
      head: [stats("README.md", 0, 500, "Markdown"), stats("a.ts", 100, 1)],
      threshold: 10,
      minCodeLines: 0,
      languageFilter: createLanguageFilter([], ["Markdown"]),
    });
    expect(analysis.files.map((f) => f.path)).toEqual(["a.ts"]);
    expect(analysis.ratio).toBe(100);
    expect(analysis.verdict.status).toBe("fail");
  });

  it("orders files by code added, descending", () => {
    const analysis = analyze({
      changes: [modified("small.ts"), modified("big.ts"), modified("shrunk.ts")],
      base: [stats("small.ts", 0, 0), stats("big.ts", 0, 0), stats("shrunk.ts", 50, 0)],
      head: [stats("small.ts", 5, 0), stats("big.ts", 500, 0), stats("shrunk.ts", 10, 0)],
      threshold: 10,
      minCodeLines: 0,
    });
    expect(analysis.files.map((f) => f.path)).toEqual(["big.ts", "small.ts", "shrunk.ts"]);
  });
});

describe("computeRatio", () => {
  it("handles the degenerate cases", () => {
    expect(computeRatio(0, 0)).toBe(0);
    expect(computeRatio(0, 5)).toBe(0);
    expect(computeRatio(5, 0)).toBe(Number.POSITIVE_INFINITY);
    expect(computeRatio(15, 3)).toBe(5);
  });
});

describe("commentPercentage", () => {
  it("returns the share of comment lines among added lines", () => {
    expect(commentPercentage(0, 0)).toBe(0);
    expect(commentPercentage(90, 10)).toBe(10);
  });
});

describe("formatRatio", () => {
  it("formats integers, decimals and infinity", () => {
    expect(formatRatio(4)).toBe("4");
    expect(formatRatio(4.25)).toBe("4.3");
    expect(formatRatio(Number.POSITIVE_INFINITY)).toBe("∞");
  });
});
