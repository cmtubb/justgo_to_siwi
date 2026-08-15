import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRankingIndex, fetchRankingRelease } from "./io";
import type { RankingIndex } from "./types";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchRankingIndex", () => {
  it("fetches index.json relative to the app's base URL", async () => {
    const index: RankingIndex = {
      generatedAt: "2026-08-15T00:00:00Z",
      releases: [{ id: "2026-2", file: "2026-2.json", counts: { K1M: 1102 } }],
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(index));
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchRankingIndex()).toEqual(index);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/rankings\/index\.json$/));
  });

  it("throws with the status code on a failed request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(null, false, 404)));
    await expect(fetchRankingIndex()).rejects.toThrow(/404/);
  });
});

describe("fetchRankingRelease", () => {
  it("reshapes a release document into Rankings, normalising numeric ranks to strings", async () => {
    const doc = {
      release: "2026-2",
      crossRelease: "2026-2-X",
      scrapedAt: "2026-08-15T00:00:00Z",
      classes: {
        K1M: [
          { name: "CASTRYCK Titouan", ranking: 1 },
          { name: "DELASSUS Anatole", ranking: 2 },
        ],
        WCSLX: [{ name: "HUG Angele", ranking: 1 }],
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(doc)));

    expect(await fetchRankingRelease("2026-2.json")).toEqual({
      K1M: [
        { name: "CASTRYCK Titouan", ranking: "1" },
        { name: "DELASSUS Anatole", ranking: "2" },
      ],
      WCSLX: [{ name: "HUG Angele", ranking: "1" }],
    });
  });

  it("throws with the status code on a failed request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(null, false, 500)));
    await expect(fetchRankingRelease("2026-2.json")).rejects.toThrow(/500/);
  });
});
