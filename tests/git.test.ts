import { describe, expect, it } from "vitest";
import { parseRawDiff } from "../src/git.js";

const A = "a".repeat(40);
const B = "b".repeat(40);
const ZERO = "0".repeat(40);

function entry(meta: string, ...paths: string[]): string {
  return `${meta}\0${paths.join("\0")}\0`;
}

describe("parseRawDiff", () => {
  it("parses additions, modifications and deletions", () => {
    const raw =
      entry(`:000000 100644 ${ZERO} ${A} A`, "new.ts") +
      entry(`:100644 100644 ${A} ${B} M`, "dir with space/mod.ts") +
      entry(`:100644 000000 ${A} ${ZERO} D`, "gone.ts");
    expect(parseRawDiff(raw)).toEqual([
      { status: "added", path: "new.ts", headOid: A },
      { status: "modified", path: "dir with space/mod.ts", baseOid: A, headOid: B },
      { status: "deleted", path: "gone.ts", baseOid: A },
    ]);
  });

  it("keeps both paths for renames and copies", () => {
    const raw =
      entry(`:100644 100644 ${A} ${A} R100`, "old.ts", "new.ts") +
      entry(`:100644 100644 ${A} ${B} C075`, "src.ts", "copy.ts");
    expect(parseRawDiff(raw)).toEqual([
      { status: "renamed", path: "new.ts", previousPath: "old.ts", baseOid: A, headOid: A },
      { status: "copied", path: "copy.ts", previousPath: "src.ts", baseOid: A, headOid: B },
    ]);
  });

  it("skips symlinks and submodules but keeps a file that replaced a symlink", () => {
    const raw =
      entry(`:000000 120000 ${ZERO} ${A} A`, "link") +
      entry(`:160000 160000 ${A} ${B} M`, "vendor/sub") +
      entry(`:120000 100644 ${A} ${B} T`, "was-link.ts");
    expect(parseRawDiff(raw)).toEqual([{ status: "typechange", path: "was-link.ts", headOid: B }]);
  });

  it("returns nothing for empty output", () => {
    expect(parseRawDiff("")).toEqual([]);
  });
});
