import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import {
  cachedRequest,
  clearCached,
  invalidateCached,
  peekCached,
  setCached,
  setCacheIdentity,
  updateCached,
} from "../resource-cache";

beforeEach(() => {
  setCacheIdentity(null);
  clearCached();
});

describe("resource cache", () => {
  it("reuses fresh data and deduplicates repeated reads", async () => {
    const loader = jest.fn(async () => ["pet-1"]);

    await expect(
      cachedRequest("pets", loader, { ttlMs: 10_000 }),
    ).resolves.toEqual(["pet-1"]);
    await expect(
      cachedRequest("pets", loader, { ttlMs: 10_000 }),
    ).resolves.toEqual(["pet-1"]);

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("can force a refresh while retaining explicit cache updates", async () => {
    setCached("pets", ["pet-1"]);
    updateCached<string[]>("pets", (current) => [...(current ?? []), "pet-2"]);
    expect(peekCached("pets")).toEqual(["pet-1", "pet-2"]);

    const loader = jest.fn(async () => ["pet-3"]);
    await expect(
      cachedRequest("pets", loader, { force: true }),
    ).resolves.toEqual(["pet-3"]);
    expect(peekCached("pets")).toEqual(["pet-3"]);
  });

  it("does not let an invalidated in-flight request restore stale data", async () => {
    let resolveRequest!: (value: string[]) => void;
    const pending = new Promise<string[]>((resolve) => {
      resolveRequest = resolve;
    });

    const request = cachedRequest("owner:pets", () => pending);
    invalidateCached("owner:");
    setCached("owner:pets", ["newer"]);
    resolveRequest(["stale"]);

    await expect(request).resolves.toEqual(["stale"]);
    expect(peekCached("owner:pets")).toEqual(["newer"]);
  });

  it("invalidates by resource prefix and clears between identities", () => {
    setCached("owner:pets", [1]);
    setCached("owner:recovery:reports", [2]);
    setCached("care:appointments:today", [3]);

    invalidateCached("owner:");
    expect(peekCached("owner:pets")).toBeUndefined();
    expect(peekCached("owner:recovery:reports")).toBeUndefined();
    expect(peekCached("care:appointments:today")).toEqual([3]);

    clearCached();
    expect(peekCached("care:appointments:today")).toBeUndefined();
  });
});

it("loads fresh private data when the signed-in UID changes without a sign-out", async () => {
  setCacheIdentity("owner-a");
  setCached("care:records:", ["private-a"]);
  setCacheIdentity("owner-b");
  const loader = jest.fn(async () => ["private-b"]);
  await expect(cachedRequest("care:records:", loader)).resolves.toEqual([
    "private-b",
  ]);
  expect(loader).toHaveBeenCalledTimes(1);
});
it("rejects results from a previous identity even after switching back to it", async () => {
  setCacheIdentity("owner-a");
  let resolve!: (value: string[]) => void;
  const request = cachedRequest(
    "pets",
    () =>
      new Promise<string[]>((r) => {
        resolve = r;
      }),
  );
  const rejected = expect(request).rejects.toThrow("account changed");
  setCacheIdentity("owner-b");
  setCacheIdentity("owner-a");
  resolve(["old-private-a"]);
  await rejected;
  expect(peekCached("pets")).toBeUndefined();
});
