import { describe, expect, it } from "vitest";
import { DEFAULT_EXCLUDED_LANGUAGES, InputError, parseInputs, parseList } from "../src/inputs.js";

function reader(values: Record<string, string>) {
  return (name: string) => values[name] ?? "";
}

describe("parseInputs", () => {
  it("applies defaults when nothing is set", () => {
    const inputs = parseInputs(reader({}));
    expect(inputs).toMatchObject({
      maxCommentRatio: 0.05,
      minLinesAdded: 50,
      include: [],
      exclude: [],
      languages: [],
      excludeLanguages: [...DEFAULT_EXCLUDED_LANGUAGES],
      failOnThreshold: true,
      comment: true,
      tokeiVersion: "12.1.2",
    });
    expect(inputs.base).toBeUndefined();
    expect(inputs.head).toBeUndefined();
  });

  it("parses every input", () => {
    const inputs = parseInputs(
      reader({
        "max-comment-ratio": "12.5%",
        "min-lines-added": "0",
        include: "src/**\nlib/**",
        exclude: "**/*.test.ts, **/generated/**",
        languages: "TypeScript, Rust",
        "exclude-languages": "JSON",
        "fail-on-threshold": "false",
        comment: "no",
        "github-token": "ghs_token",
        "tokei-version": "v12.1.2",
        base: " abc ",
        head: "def",
      }),
    );
    expect(inputs).toEqual({
      maxCommentRatio: 0.125,
      minLinesAdded: 0,
      include: ["src/**", "lib/**"],
      exclude: ["**/*.test.ts", "**/generated/**"],
      languages: ["TypeScript", "Rust"],
      excludeLanguages: ["JSON"],
      failOnThreshold: false,
      comment: false,
      githubToken: "ghs_token",
      tokeiVersion: "12.1.2",
      base: "abc",
      head: "def",
    });
  });

  it("accepts fractions and percentages for the ratio", () => {
    expect(parseInputs(reader({ "max-comment-ratio": "0" })).maxCommentRatio).toBe(0);
    expect(parseInputs(reader({ "max-comment-ratio": "1" })).maxCommentRatio).toBe(1);
    expect(parseInputs(reader({ "max-comment-ratio": "0.25" })).maxCommentRatio).toBe(0.25);
    expect(parseInputs(reader({ "max-comment-ratio": "25%" })).maxCommentRatio).toBe(0.25);
  });

  it('lets "none" clear the default language exclusions', () => {
    expect(parseInputs(reader({ "exclude-languages": "None" })).excludeLanguages).toEqual([]);
  });

  it("accepts the system tokei", () => {
    expect(parseInputs(reader({ "tokei-version": "System" })).tokeiVersion).toBe("system");
  });

  it.each([
    ["max-comment-ratio", "-0.1"],
    ["max-comment-ratio", "1.5"],
    ["max-comment-ratio", "101%"],
    ["max-comment-ratio", "lots"],
    ["min-lines-added", "-5"],
    ["min-lines-added", "1.5"],
    ["fail-on-threshold", "maybe"],
    ["tokei-version", "latest"],
  ])("rejects invalid %s=%s", (name, value) => {
    expect(() => parseInputs(reader({ [name]: value }))).toThrow(InputError);
  });
});

describe("parseList", () => {
  it("splits on commas and newlines and drops blanks and comments", () => {
    expect(parseList("a, b\n\n c ,\n# note\nd")).toEqual(["a", "b", "c", "d"]);
  });
});
