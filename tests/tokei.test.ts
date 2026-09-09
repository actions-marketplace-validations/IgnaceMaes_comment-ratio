import { readFileSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { assetFor, TokeiInstallError } from "../src/tokei/install.js";
import { parseTokeiJson, summarise, TokeiRunError } from "../src/tokei/run.js";

const fixture = (name: string) =>
  readFileSync(path.join(import.meta.dirname, "fixtures", name), "utf8");

const byPath = (a: { path: string }, b: { path: string }) => (a.path < b.path ? -1 : 1);

describe("parseTokeiJson", () => {
  it("flattens tokei 12 output into per-file stats with embedded blobs folded in", () => {
    const files = parseTokeiJson(fixture("tokei-12.json"), "fx");
    expect(files.toSorted(byPath)).toEqual([
      { path: "README.md", language: "Markdown", code: 0, comments: 6, blanks: 2 },
      // 4 HTML code lines + 1 embedded JavaScript code line, 1 + 1 comment lines.
      { path: "index.html", language: "HTML", code: 5, comments: 2, blanks: 0 },
      { path: "src/.hidden.js", language: "JavaScript", code: 1, comments: 1, blanks: 0 },
      { path: "src/a.ts", language: "TypeScript", code: 3, comments: 6, blanks: 1 },
    ]);
  });

  it("parses tokei 13+ output identically", () => {
    const v12 = parseTokeiJson(fixture("tokei-12.json"), "fx");
    const v13 = parseTokeiJson(fixture("tokei-13.json"), "fx");
    expect(v13.toSorted(byPath)).toEqual(v12.toSorted(byPath));
  });

  it("uses paths relative to the scanned root", () => {
    const files = parseTokeiJson(fixture("tokei-12.json"), "/abs/path/fx");
    expect(files.map((f) => f.path)).not.toContain(expect.stringContaining("fx/"));
  });

  it("treats empty output as no files", () => {
    expect(parseTokeiJson("", "fx")).toEqual([]);
    expect(parseTokeiJson("{}", "fx")).toEqual([]);
  });

  it("rejects malformed output", () => {
    expect(() => parseTokeiJson("nope", "fx")).toThrow(TokeiRunError);
    expect(() => parseTokeiJson("[]", "fx")).toThrow(TokeiRunError);
  });
});

describe("summarise", () => {
  it("adds nested blobs recursively", () => {
    expect(
      summarise({
        code: 1,
        comments: 1,
        blanks: 1,
        blobs: {
          JavaScript: {
            code: 2,
            comments: 2,
            blanks: 0,
            blobs: { CSS: { code: 3, comments: 0, blanks: 0 } },
          },
        },
      }),
    ).toEqual({ code: 6, comments: 3, blanks: 1 });
  });
});

describe("assetFor", () => {
  it.each([
    ["linux", "x64", "tokei-x86_64-unknown-linux-musl.tar.gz"],
    ["linux", "arm64", "tokei-aarch64-unknown-linux-gnu.tar.gz"],
    ["darwin", "x64", "tokei-x86_64-apple-darwin.tar.gz"],
    ["darwin", "arm64", "tokei-x86_64-apple-darwin.tar.gz"],
    ["win32", "x64", "tokei-x86_64-pc-windows-msvc.exe"],
  ] as const)("maps %s/%s", (platform, arch, asset) => {
    expect(assetFor(platform, arch)).toBe(asset);
  });

  it("explains unsupported platforms", () => {
    expect(() => assetFor("freebsd", "x64")).toThrow(TokeiInstallError);
  });
});
