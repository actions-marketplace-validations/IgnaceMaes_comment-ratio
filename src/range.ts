import * as core from "@actions/core";
import type { context as GitHubContext } from "@actions/github";
import { ensureCommit, localMergeBase, revParse } from "./git.js";
import type { Inputs } from "./inputs.js";

export class CommitRangeError extends Error {
  override name = "CommitRangeError";
}

export interface CommitRange {
  base: string;
  head: string;
}

export interface ResolvedRange extends CommitRange {
  /** Commit the head side is compared against (merge base when available). */
  mergeBase: string;
}

/** Minimal Octokit surface used here, kept narrow so tests can stub it. */
export interface CompareClient {
  rest: {
    repos: {
      compareCommitsWithBasehead(params: {
        owner: string;
        repo: string;
        basehead: string;
        per_page?: number;
      }): Promise<{ data: { merge_base_commit: { sha: string } } }>;
    };
  };
}

/**
 * Work out which two commits to compare from explicit inputs or the triggering
 * event. Returns `undefined` when there is legitimately nothing to compare
 * (for example the first push of a new branch).
 */
export function rangeFromContext(
  context: Pick<typeof GitHubContext, "eventName" | "payload">,
  inputs: Pick<Inputs, "base" | "head">,
): CommitRange | undefined {
  if (inputs.base && inputs.head) return { base: inputs.base, head: inputs.head };
  if (inputs.base || inputs.head) {
    throw new CommitRangeError(
      'Both "base" and "head" must be set when overriding the commit range',
    );
  }

  const { eventName, payload } = context;
  switch (eventName) {
    case "pull_request":
    case "pull_request_target":
    case "pull_request_review":
    case "pull_request_review_comment": {
      const pr = payload.pull_request;
      const base = pr?.base?.sha;
      const head = pr?.head?.sha;
      if (typeof base !== "string" || typeof head !== "string") {
        throw new CommitRangeError("Pull request payload is missing base/head SHAs");
      }
      return { base, head };
    }
    case "push": {
      const before = payload.before;
      const after = payload.after;
      if (typeof before !== "string" || typeof after !== "string") {
        throw new CommitRangeError("Push payload is missing before/after SHAs");
      }
      if (/^0+$/.test(before)) return undefined;
      return { base: before, head: after };
    }
    case "merge_group": {
      const group = payload.merge_group as { base_sha?: string; head_sha?: string } | undefined;
      if (typeof group?.base_sha !== "string" || typeof group.head_sha !== "string") {
        throw new CommitRangeError("Merge group payload is missing base_sha/head_sha");
      }
      return { base: group.base_sha, head: group.head_sha };
    }
    default:
      throw new CommitRangeError(
        `Unsupported event "${eventName}". Set the "base" and "head" inputs explicitly.`,
      );
  }
}

/**
 * Ensure both commits are present locally and find the merge base so a head
 * that lags behind its base branch is not blamed for upstream changes.
 */
export async function resolveRange(
  range: CommitRange,
  repo: { owner: string; repo: string },
  octokit?: CompareClient,
): Promise<ResolvedRange> {
  await ensureCommit(range.head);
  await ensureCommit(range.base);
  const head = await revParse(range.head);
  const base = await revParse(range.base);

  const local = await localMergeBase(base, head);
  if (local) return { base, head, mergeBase: local };

  if (octokit) {
    try {
      const { data } = await octokit.rest.repos.compareCommitsWithBasehead({
        ...repo,
        basehead: `${base}...${head}`,
        per_page: 1,
      });
      const mergeBase = data.merge_base_commit.sha;
      await ensureCommit(mergeBase);
      return { base, head, mergeBase };
    } catch (error) {
      core.warning(`Could not determine merge base via the GitHub API: ${describe(error)}`);
    }
  }

  core.warning(
    `Could not determine the merge base of ${short(base)} and ${short(head)}; ` +
      "comparing against the base commit directly. Use `fetch-depth: 0` for exact results.",
  );
  return { base, head, mergeBase: base };
}

function short(sha: string): string {
  return sha.slice(0, 7);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
