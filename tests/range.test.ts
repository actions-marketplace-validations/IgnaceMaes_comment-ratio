import { describe, expect, it } from "vitest";
import { CommitRangeError, rangeFromContext } from "../src/range.js";

describe("rangeFromContext", () => {
  it("prefers explicit inputs", () => {
    expect(rangeFromContext({ eventName: "push", payload: {} }, { base: "a", head: "b" })).toEqual({
      base: "a",
      head: "b",
    });
  });

  it("requires both inputs when one is given", () => {
    expect(() => rangeFromContext({ eventName: "push", payload: {} }, { base: "a" })).toThrow(
      CommitRangeError,
    );
  });

  it("reads pull request SHAs", () => {
    const payload = { pull_request: { number: 1, base: { sha: "base" }, head: { sha: "head" } } };
    expect(rangeFromContext({ eventName: "pull_request", payload }, {})).toEqual({
      base: "base",
      head: "head",
    });
    expect(rangeFromContext({ eventName: "pull_request_target", payload }, {})).toEqual({
      base: "base",
      head: "head",
    });
  });

  it("reads push before/after and skips brand new branches", () => {
    expect(
      rangeFromContext({ eventName: "push", payload: { before: "b", after: "a" } }, {}),
    ).toEqual({ base: "b", head: "a" });
    expect(
      rangeFromContext({ eventName: "push", payload: { before: "0".repeat(40), after: "a" } }, {}),
    ).toBeUndefined();
  });

  it("reads merge group SHAs", () => {
    expect(
      rangeFromContext(
        { eventName: "merge_group", payload: { merge_group: { base_sha: "b", head_sha: "h" } } },
        {},
      ),
    ).toEqual({ base: "b", head: "h" });
  });

  it("rejects unsupported events with guidance", () => {
    expect(() => rangeFromContext({ eventName: "schedule", payload: {} }, {})).toThrow(
      /Set the "base" and "head" inputs/,
    );
  });
});
