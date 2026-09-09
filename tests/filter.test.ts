import { describe, expect, it } from "vitest";
import { createLanguageFilter, createPathFilter } from "../src/filter.js";

describe("createPathFilter", () => {
  it("accepts everything by default", () => {
    const filter = createPathFilter([], []);
    expect(filter("src/index.ts")).toBe(true);
    expect(filter(".github/workflows/ci.yml")).toBe(true);
  });

  it("restricts to include globs", () => {
    const filter = createPathFilter(["src/**"], []);
    expect(filter("src/a/b.ts")).toBe(true);
    expect(filter("lib/a.ts")).toBe(false);
  });

  it("applies exclude globs after include globs", () => {
    const filter = createPathFilter(["src/**"], ["**/*.test.ts", "**/generated/**"]);
    expect(filter("src/a.ts")).toBe(true);
    expect(filter("src/a.test.ts")).toBe(false);
    expect(filter("src/generated/schema.ts")).toBe(false);
  });

  it("matches dotfiles", () => {
    const filter = createPathFilter([], ["**/.eslintrc.js"]);
    expect(filter("packages/x/.eslintrc.js")).toBe(false);
  });
});

describe("createLanguageFilter", () => {
  it("denies excluded languages case-insensitively", () => {
    const filter = createLanguageFilter([], ["markdown"]);
    expect(filter("Markdown")).toBe(false);
    expect(filter("TypeScript")).toBe(true);
  });

  it("restricts to an allow list", () => {
    const filter = createLanguageFilter(["TypeScript"], []);
    expect(filter("TypeScript")).toBe(true);
    expect(filter("Rust")).toBe(false);
  });

  it("lets the deny list win over the allow list", () => {
    const filter = createLanguageFilter(["TypeScript"], ["typescript"]);
    expect(filter("TypeScript")).toBe(false);
  });
});
