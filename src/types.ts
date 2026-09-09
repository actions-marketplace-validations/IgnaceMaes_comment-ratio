/** Line counts as reported by tokei for a single file or an aggregate. */
export interface LineStats {
  code: number;
  comments: number;
  blanks: number;
}

/** Line counts for one file, including the language tokei detected. */
export interface FileStats extends LineStats {
  /** Path relative to the repository root, always using forward slashes. */
  path: string;
  /** tokei language name, e.g. `TypeScript` or `Rust`. */
  language: string;
}

export type ChangeStatus = "added" | "modified" | "deleted" | "renamed" | "copied" | "typechange";

/** A file touched between two commits, as reported by `git diff --raw`. */
export interface ChangedFile {
  status: ChangeStatus;
  /** Path on the head side (or the base side for deletions). */
  path: string;
  /** Path on the base side for renames and copies. */
  previousPath?: string;
  /** Blob object id on the base side; undefined when the file did not exist. */
  baseOid?: string;
  /** Blob object id on the head side; undefined when the file was deleted. */
  headOid?: string;
}

export const EMPTY_STATS: LineStats = Object.freeze({ code: 0, comments: 0, blanks: 0 });
