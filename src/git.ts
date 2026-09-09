import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";
import * as core from "@actions/core";
import { exec, getExecOutput } from "@actions/exec";
import type { ChangedFile, ChangeStatus } from "./types.js";

export class GitError extends Error {
  override name = "GitError";
}

const NULL_OID = /^0+$/;
const MODE_SYMLINK = "120000";
const MODE_SUBMODULE = "160000";

export interface GitOptions {
  cwd?: string;
}

/** Run a git command and return trimmed stdout, throwing on non-zero exit. */
export async function git(args: string[], options: GitOptions = {}): Promise<string> {
  const { exitCode, stdout, stderr } = await getExecOutput("git", args, {
    silent: true,
    ignoreReturnCode: true,
    ...(options.cwd ? { cwd: options.cwd } : {}),
  });
  if (exitCode !== 0) {
    throw new GitError(`git ${args.join(" ")} failed (${exitCode}): ${stderr.trim()}`);
  }
  return stdout.trim();
}

export async function hasCommit(ref: string, options: GitOptions = {}): Promise<boolean> {
  try {
    await git(["cat-file", "-e", `${ref}^{commit}`], options);
    return true;
  } catch {
    return false;
  }
}

/**
 * Make sure a commit exists locally, fetching it from `origin` when the
 * checkout is shallow. GitHub allows fetching any reachable commit by SHA.
 */
export async function ensureCommit(ref: string, options: GitOptions = {}): Promise<void> {
  if (await hasCommit(ref, options)) return;
  core.info(`Fetching ${ref} from origin`);
  await git(["fetch", "--no-tags", "--no-recurse-submodules", "--depth=1", "origin", ref], options);
  if (!(await hasCommit(ref, options))) {
    throw new GitError(`Commit ${ref} is not available after fetching from origin`);
  }
}

/** Resolve a commit-ish to a full SHA. */
export async function revParse(ref: string, options: GitOptions = {}): Promise<string> {
  return git(["rev-parse", "--verify", `${ref}^{commit}`], options);
}

/** Local merge base, or undefined when history is too shallow to tell. */
export async function localMergeBase(
  base: string,
  head: string,
  options: GitOptions = {},
): Promise<string | undefined> {
  try {
    return await git(["merge-base", base, head], options);
  } catch {
    return undefined;
  }
}

/** List files that differ between two commits, with rename detection. */
export async function listChangedFiles(
  base: string,
  head: string,
  options: GitOptions = {},
): Promise<ChangedFile[]> {
  const raw = await git(["diff", "--raw", "-z", "-M", "--no-abbrev", "--no-color", base, head], {
    ...options,
  });
  return parseRawDiff(raw);
}

/**
 * Parse `git diff --raw -z` output.
 *
 * Each entry looks like `:<srcmode> <dstmode> <srcoid> <dstoid> <status>\0<path>\0`
 * with a second path for renames and copies. Symlinks and submodules are skipped
 * because they carry no countable source.
 */
export function parseRawDiff(raw: string): ChangedFile[] {
  const tokens = raw.split("\0").filter((token) => token !== "");
  const files: ChangedFile[] = [];
  let index = 0;

  while (index < tokens.length) {
    const meta = tokens[index++];
    if (!meta?.startsWith(":")) continue;
    const [srcMode, dstMode, srcOid, dstOid, statusToken] = meta.slice(1).split(" ");
    if (!srcMode || !dstMode || !srcOid || !dstOid || !statusToken) continue;

    const status = toStatus(statusToken);
    const primary = tokens[index++];
    if (primary === undefined) break;
    let previousPath: string | undefined;
    let filePath = primary;
    if (status === "renamed" || status === "copied") {
      previousPath = primary;
      const next = tokens[index++];
      if (next === undefined) break;
      filePath = next;
    }

    const file: ChangedFile = { status, path: filePath };
    if (previousPath !== undefined) file.previousPath = previousPath;
    if (!NULL_OID.test(srcOid) && !isUncountable(srcMode)) file.baseOid = srcOid;
    if (!NULL_OID.test(dstOid) && !isUncountable(dstMode)) file.headOid = dstOid;
    // Nothing countable on either side (symlink, submodule): skip.
    if (file.baseOid === undefined && file.headOid === undefined) continue;
    files.push(file);
  }

  return files;
}

function isUncountable(mode: string): boolean {
  return mode === MODE_SYMLINK || mode === MODE_SUBMODULE;
}

function toStatus(token: string): ChangeStatus {
  switch (token.charAt(0)) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    case "T":
      return "typechange";
    default:
      return "modified";
  }
}

/** Read many blobs in one `git cat-file --batch` round-trip. */
export async function readBlobs(
  oids: string[],
  options: GitOptions = {},
): Promise<Map<string, Buffer>> {
  const unique = [...new Set(oids)];
  const blobs = new Map<string, Buffer>();
  if (unique.length === 0) return blobs;

  const chunks: Buffer[] = [];
  const exitCode = await exec("git", ["cat-file", "--batch"], {
    silent: true,
    ignoreReturnCode: true,
    input: Buffer.from(`${unique.join("\n")}\n`),
    listeners: { stdout: (data: Buffer) => chunks.push(data) },
    ...(options.cwd ? { cwd: options.cwd } : {}),
  });
  if (exitCode !== 0) {
    throw new GitError(`git cat-file --batch failed (${exitCode})`);
  }

  const output = Buffer.concat(chunks);
  let offset = 0;
  while (offset < output.length) {
    const newline = output.indexOf(0x0a, offset);
    if (newline === -1) break;
    const header = output.subarray(offset, newline).toString("utf8");
    offset = newline + 1;
    const [oid, type, sizeToken] = header.split(" ");
    if (!oid) break;
    if (type === "missing" || sizeToken === undefined) {
      core.warning(`Blob ${oid} is missing from the local object store`);
      continue;
    }
    const size = Number(sizeToken);
    blobs.set(oid, output.subarray(offset, offset + size));
    offset += size + 1; // trailing newline after content
  }
  return blobs;
}

export interface Snapshot {
  baseDir: string;
  headDir: string;
}

/**
 * Write the base and head versions of every changed file into two directory
 * trees so tokei can count each side independently. Only files that actually
 * differ are written; a mode-only change yields identical blobs and is skipped.
 */
export async function materialize(
  files: ChangedFile[],
  root: string,
  options: GitOptions = {},
): Promise<Snapshot> {
  const baseDir = path.join(root, "base");
  const headDir = path.join(root, "head");
  await mkdir(baseDir, { recursive: true });
  await mkdir(headDir, { recursive: true });

  const wanted = files.filter((file) => file.baseOid !== file.headOid);
  const oids = wanted.flatMap((file) =>
    [file.baseOid, file.headOid].filter((oid): oid is string => oid !== undefined),
  );
  const blobs = await readBlobs(oids, options);

  await Promise.all(
    wanted.flatMap((file) => {
      const writes: Promise<void>[] = [];
      const basePath = file.previousPath ?? file.path;
      const baseBlob = file.baseOid ? blobs.get(file.baseOid) : undefined;
      const headBlob = file.headOid ? blobs.get(file.headOid) : undefined;
      if (baseBlob) writes.push(writeInto(baseDir, basePath, baseBlob));
      if (headBlob) writes.push(writeInto(headDir, file.path, headBlob));
      return writes;
    }),
  );

  return { baseDir, headDir };
}

async function writeInto(dir: string, relativePath: string, content: Buffer): Promise<void> {
  const target = path.join(dir, ...relativePath.split("/"));
  if (!target.startsWith(dir + path.sep)) {
    throw new GitError(`Refusing to write outside snapshot directory: ${relativePath}`);
  }
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}
