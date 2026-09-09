import { describe, expect, it } from "vitest";
import { DEFAULT_EXCLUDED_LANGUAGES, InputError, parseInputs, parseList } from "../src/inputs.js";

function reader(values: Record<string, string>) {
  return (name: string) => values[name] ?? "";
}

describe("parseInputs", () => {
  it("applies defaults when nothing is set", () => {
    const inputs = parseInputs(reader({}));
    expect(inputs).toMatchObject({
      threshold: 10,
      minCodeLines: 50,
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
        threshold: "4.5",
        "min-code-lines": "0",
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
      threshold: 4.5,
      minCodeLines: 0,
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

  it('lets "none" clear the default language exclusions', () => {
    expect(parseInputs(reader({ "exclude-languages": "None" })).excludeLanguages).toEqual([]);
  });

  it("accepts the system tokei", () => {
    expect(parseInputs(reader({ "tokei-version": "System" })).tokeiVersion).toBe("system");
  });

  it.each([
    ["threshold", "0"],
    ["threshold", "-1"],
    ["threshold", "ten"],
    ["min-code-lines", "-5"],
    ["min-code-lines", "1.5"],
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
