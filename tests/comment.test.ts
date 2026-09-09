import { describe, expect, it, vi } from "vitest";
import { type CommentClient, upsertComment } from "../src/comment.js";
import { COMMENT_MARKER } from "../src/report.js";

vi.mock("@actions/core", () => ({ info: vi.fn(), warning: vi.fn() }));

function client(comments: Array<{ id: number; body?: string }>) {
  const octokit = {
    rest: {
      issues: {
        listComments: vi.fn(async () => ({ data: comments })),
        updateComment: vi.fn(async () => ({})),
        createComment: vi.fn(async () => ({})),
      },
    },
  };
  return octokit as unknown as CommentClient & typeof octokit;
}

const target = { owner: "o", repo: "r", issueNumber: 7 };

describe("upsertComment", () => {
  it("creates a comment when none carries the marker", async () => {
    const octokit = client([{ id: 1, body: "unrelated" }]);
    await expect(upsertComment(octokit, target, "body")).resolves.toBe("created");
    expect(octokit.rest.issues.createComment).toHaveBeenCalledWith({
      owner: "o",
      repo: "r",
      issue_number: 7,
      body: "body",
    });
    expect(octokit.rest.issues.updateComment).not.toHaveBeenCalled();
  });

  it("updates the existing marked comment", async () => {
    const octokit = client([
      { id: 1, body: "unrelated" },
      { id: 2, body: `${COMMENT_MARKER}\nold` },
    ]);
    await expect(upsertComment(octokit, target, "new")).resolves.toBe("updated");
    expect(octokit.rest.issues.updateComment).toHaveBeenCalledWith({
      owner: "o",
      repo: "r",
      comment_id: 2,
      body: "new",
    });
    expect(octokit.rest.issues.createComment).not.toHaveBeenCalled();
  });
});
