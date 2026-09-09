import * as core from "@actions/core";
import { COMMENT_MARKER } from "./report.js";

/** Minimal Octokit surface used here, kept narrow so tests can stub it. */
export interface CommentClient {
  rest: {
    issues: {
      listComments(params: {
        owner: string;
        repo: string;
        issue_number: number;
        per_page?: number;
        page?: number;
      }): Promise<{ data: Array<{ id: number; body?: string }> }>;
      updateComment(params: {
        owner: string;
        repo: string;
        comment_id: number;
        body: string;
      }): Promise<unknown>;
      createComment(params: {
        owner: string;
        repo: string;
        issue_number: number;
        body: string;
      }): Promise<unknown>;
    };
  };
}

export interface CommentTarget {
  owner: string;
  repo: string;
  issueNumber: number;
}

/**
 * Create the report comment on first run and edit it in place afterwards so a
 * pull request never accumulates a pile of stale reports.
 */
export async function upsertComment(
  octokit: CommentClient,
  target: CommentTarget,
  body: string,
): Promise<"created" | "updated"> {
  const { owner, repo, issueNumber } = target;
  const existing = await findExistingComment(octokit, target);
  if (existing !== undefined) {
    await octokit.rest.issues.updateComment({ owner, repo, comment_id: existing, body });
    core.info(`Updated pull request comment ${existing}`);
    return "updated";
  }
  await octokit.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body });
  core.info("Created pull request comment");
  return "created";
}

async function findExistingComment(
  octokit: CommentClient,
  target: CommentTarget,
): Promise<number | undefined> {
  const perPage = 100;
  for (let page = 1; page <= 10; page++) {
    const { data } = await octokit.rest.issues.listComments({
      owner: target.owner,
      repo: target.repo,
      issue_number: target.issueNumber,
      per_page: perPage,
      page,
    });
    const match = data.find((comment) => comment.body?.includes(COMMENT_MARKER));
    if (match) return match.id;
    if (data.length < perPage) break;
  }
  return undefined;
}
