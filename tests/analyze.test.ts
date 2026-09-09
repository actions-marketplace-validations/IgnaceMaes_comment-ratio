import { describe, expect, it } from "vitest";
import { analyze, commentRatio, fileRatio, formatPercent } from "../src/analyze.js";
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
  it("sums positive per-file deltas and passes under the limit", () => {
    const analysis = analyze({
      changes: [modified("a.ts"), modified("b.ts")],
      base: [stats("a.ts", 100, 10), stats("b.ts", 50, 5)],
      head: [stats("a.ts", 180, 20), stats("b.ts", 30, 2)],
      maxRatio: 0.25,
      minLinesAdded: 0,
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
    expect(analysis.ratio).toBeCloseTo(0.1111, 4);
    expect(analysis.verdict).toEqual({
      status: "pass",
      reason: "11.1% of the added lines are comments (10 of 90), within the limit of 25%.",
    });
  });

  it("fails when the ratio exceeds the limit", () => {
    const analysis = analyze({
      changes: [modified("a.ts")],
      base: [stats("a.ts", 0, 0)],
      head: [stats("a.ts", 60, 40)],
      maxRatio: 0.25,
      minLinesAdded: 0,
    });
    expect(analysis.ratio).toBe(0.4);
    expect(analysis.verdict).toEqual({
      status: "fail",
      reason: "40% of the added lines are comments (40 of 100); the limit is 25%.",
    });
  });

  it("passes exactly at the limit", () => {
    const analysis = analyze({
      changes: [modified("a.ts")],
      base: [],
      head: [stats("a.ts", 75, 25)],
      maxRatio: 0.25,
      minLinesAdded: 0,
    });
    expect(analysis.verdict.status).toBe("pass");
  });

  it("fails a change that only adds comments", () => {
    const analysis = analyze({
      changes: [modified("a.ts")],
      base: [stats("a.ts", 100, 0)],
      head: [stats("a.ts", 100, 80)],
      maxRatio: 0.25,
      minLinesAdded: 50,
    });
    expect(analysis.ratio).toBe(1);
    expect(analysis.verdict.status).toBe("fail");
  });

  it("skips small changes below min-lines-added, counting code and comments", () => {
    const analysis = analyze({
      changes: [modified("a.ts")],
      base: [stats("a.ts", 0, 0)],
      head: [stats("a.ts", 20, 20)],
      maxRatio: 0.25,
      minLinesAdded: 50,
    });
    expect(analysis.verdict.status).toBe("skip");
    expect(analysis.verdict.reason).toContain("Only 40 lines added");
  });

  it("skips when nothing countable changed", () => {
    const analysis = analyze({
      changes: [modified("image.png")],
      base: [],
      head: [],
      maxRatio: 0.25,
      minLinesAdded: 0,
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
      maxRatio: 0.25,
      minLinesAdded: 0,
    });
    expect(analysis.files[0]).toMatchObject({
      path: "new/name.ts",
      previousPath: "old/name.ts",
      codeDelta: 10,
      commentsDelta: 0,
    });
  });

  it("treats deleted files as pure removals and passes", () => {
    const analysis = analyze({
      changes: [{ status: "deleted", path: "gone.ts", baseOid: "a".repeat(40) }],
      base: [stats("gone.ts", 40, 40)],
      head: [],
      maxRatio: 0.25,
      minLinesAdded: 0,
    });
    expect(analysis.totals).toMatchObject({ codeAdded: 0, codeRemoved: 40, commentsRemoved: 40 });
    expect(analysis.ratio).toBe(0);
    expect(analysis.verdict.status).toBe("pass");
  });

  it("applies the language filter using the head language", () => {
    const analysis = analyze({
      changes: [modified("README.md"), modified("a.ts")],
      base: [stats("README.md", 0, 10, "Markdown"), stats("a.ts", 0, 0)],
      head: [stats("README.md", 0, 500, "Markdown"), stats("a.ts", 100, 1)],
      maxRatio: 0.25,
      minLinesAdded: 0,
      languageFilter: createLanguageFilter([], ["Markdown"]),
    });
    expect(analysis.files.map((f) => f.path)).toEqual(["a.ts"]);
    expect(analysis.verdict.status).toBe("pass");
  });

  it("orders files by comments added, then code added", () => {
    const analysis = analyze({
      changes: [modified("code.ts"), modified("chatty.ts"), modified("shrunk.ts")],
      base: [stats("code.ts", 0, 0), stats("chatty.ts", 0, 0), stats("shrunk.ts", 50, 5)],
      head: [stats("code.ts", 500, 5), stats("chatty.ts", 10, 30), stats("shrunk.ts", 10, 0)],
      maxRatio: 0.25,
      minLinesAdded: 0,
    });
    expect(analysis.files.map((f) => f.path)).toEqual(["chatty.ts", "code.ts", "shrunk.ts"]);
  });
});

describe("commentRatio", () => {
  it("handles the degenerate cases", () => {
    expect(commentRatio(0, 0)).toBe(0);
    expect(commentRatio(5, 0)).toBe(0);
    expect(commentRatio(0, 5)).toBe(1);
    expect(commentRatio(75, 25)).toBe(0.25);
  });
});

describe("fileRatio", () => {
  const base = { path: "x", status: "modified", language: "TypeScript" } as const;
  const lines = { code: 0, comments: 0, blanks: 0 };

  it("is undefined when nothing was added", () => {
    expect(
      fileRatio({ ...base, base: lines, head: lines, codeDelta: 0, commentsDelta: 0 }),
    ).toBeUndefined();
    expect(
      fileRatio({ ...base, base: lines, head: lines, codeDelta: -4, commentsDelta: -1 }),
    ).toBeUndefined();
  });

  it("ignores removals on the other axis", () => {
    expect(fileRatio({ ...base, base: lines, head: lines, codeDelta: -10, commentsDelta: 5 })).toBe(
      1,
    );
    expect(fileRatio({ ...base, base: lines, head: lines, codeDelta: 30, commentsDelta: 10 })).toBe(
      0.25,
    );
  });
});

describe("formatPercent", () => {
  it("formats whole numbers without decimals and others with one", () => {
    expect(formatPercent(0.25)).toBe("25%");
    expect(formatPercent(1 / 3)).toBe("33.3%");
    expect(formatPercent(0.2496)).toBe("25%");
    expect(formatPercent(0.05)).toBe("5%");
  });
});
