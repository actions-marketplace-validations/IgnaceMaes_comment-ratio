import picomatch from "picomatch";

export type PathFilter = (path: string) => boolean;
export type LanguageFilter = (language: string) => boolean;

/**
 * Build a predicate from include/exclude glob lists. Globs use picomatch
 * semantics (`**` matches across directories, dotfiles are matched).
 */
export function createPathFilter(include: string[], exclude: string[]): PathFilter {
  const options: picomatch.PicomatchOptions = { dot: true };
  const isIncluded = include.length === 0 ? () => true : picomatch(include, options);
  const isExcluded = exclude.length === 0 ? () => false : picomatch(exclude, options);
  return (path) => isIncluded(path) && !isExcluded(path);
}

/** Case-insensitive allow/deny predicate over tokei language names. */
export function createLanguageFilter(languages: string[], excluded: string[]): LanguageFilter {
  const allow = new Set(languages.map(normalize));
  const deny = new Set(excluded.map(normalize));
  return (language) => {
    const key = normalize(language);
    if (deny.has(key)) return false;
    return allow.size === 0 || allow.has(key);
  };
}

function normalize(language: string): string {
  return language.trim().toLowerCase();
}
