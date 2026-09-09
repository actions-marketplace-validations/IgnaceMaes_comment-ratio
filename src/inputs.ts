/**
 * tokei treats prose formats as "comments" (every line of a Markdown file is a
 * comment). Counting those would let a README edit paper over an uncommented
 * code change, so they are excluded unless the user opts back in.
 */
export const DEFAULT_EXCLUDED_LANGUAGES = [
  "Markdown",
  "Plain Text",
  "ReStructuredText",
  "AsciiDoc",
  "Org",
  "Djot",
] as const;

export const DEFAULT_TOKEI_VERSION = "12.1.2";

export interface Inputs {
  /** Maximum allowed ratio of added code lines to added comment lines. */
  threshold: number;
  /** Skip the check when fewer code lines than this were added. */
  minCodeLines: number;
  /** Glob patterns; when non-empty only matching paths are analyzed. */
  include: string[];
  /** Glob patterns; matching paths are ignored. */
  exclude: string[];
  /** tokei language names; when non-empty only these languages are analyzed. */
  languages: string[];
  /** tokei language names to ignore. */
  excludeLanguages: string[];
  /** Whether exceeding the threshold fails the job. */
  failOnThreshold: boolean;
  /** Whether to post or update a sticky pull request comment. */
  comment: boolean;
  githubToken: string;
  /** Semver version of tokei to download, or `system` to use the one on PATH. */
  tokeiVersion: string;
  /** Explicit base commit-ish; overrides event-derived values. */
  base?: string;
  /** Explicit head commit-ish; overrides event-derived values. */
  head?: string;
}

export type InputReader = (name: string) => string;

export class InputError extends Error {
  override name = "InputError";
}

/** Parse and validate raw action inputs. Pure so it can be unit-tested. */
export function parseInputs(read: InputReader): Inputs {
  const threshold = parseNumber(read, "threshold", 10);
  if (!(threshold > 0)) {
    throw new InputError(`"threshold" must be a positive number, got "${read("threshold")}"`);
  }

  const minCodeLines = parseNumber(read, "min-code-lines", 50);
  if (!Number.isInteger(minCodeLines) || minCodeLines < 0) {
    throw new InputError(
      `"min-code-lines" must be a non-negative integer, got "${read("min-code-lines")}"`,
    );
  }

  const tokeiVersion = normalizeTokeiVersion(read("tokei-version") || DEFAULT_TOKEI_VERSION);

  const excludeLanguages = parseExcludeLanguages(read("exclude-languages"));

  return {
    threshold,
    minCodeLines,
    include: parseList(read("include")),
    exclude: parseList(read("exclude")),
    languages: parseList(read("languages")),
    excludeLanguages,
    failOnThreshold: parseBoolean(read, "fail-on-threshold", true),
    comment: parseBoolean(read, "comment", true),
    githubToken: read("github-token"),
    tokeiVersion,
    ...optional("base", read("base")),
    ...optional("head", read("head")),
  };
}

/** Empty means "use the defaults"; the word `none` opts out of them. */
function parseExcludeLanguages(raw: string): string[] {
  const value = raw.trim();
  if (value === "") return [...DEFAULT_EXCLUDED_LANGUAGES];
  if (value.toLowerCase() === "none") return [];
  return parseList(value);
}

function optional<K extends string>(key: K, value: string): { [P in K]?: string } {
  const trimmed = value.trim();
  return trimmed === "" ? {} : ({ [key]: trimmed } as { [P in K]: string });
}

function parseNumber(read: InputReader, name: string, fallback: number): number {
  const raw = read(name).trim();
  if (raw === "") return fallback;
  const value = Number(raw);
  if (Number.isNaN(value)) {
    throw new InputError(`"${name}" must be a number, got "${raw}"`);
  }
  return value;
}

function parseBoolean(read: InputReader, name: string, fallback: boolean): boolean {
  const raw = read(name).trim().toLowerCase();
  if (raw === "") return fallback;
  if (raw === "true" || raw === "yes" || raw === "1") return true;
  if (raw === "false" || raw === "no" || raw === "0") return false;
  throw new InputError(`"${name}" must be true or false, got "${raw}"`);
}

/** Split a comma- or newline-separated list, dropping blanks. */
export function parseList(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item !== "" && !item.startsWith("#"));
}

function normalizeTokeiVersion(raw: string): string {
  const value = raw.trim();
  if (value.toLowerCase() === "system") return "system";
  const version = value.replace(/^v/i, "");
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new InputError(
      `"tokei-version" must be a semver version like "12.1.2" or the word "system", got "${raw}"`,
    );
  }
  return version;
}
