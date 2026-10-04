import { expect, test } from "bun:test";
import { searchSources } from "../src/search.ts";

test("lexical fallback retains code identifiers, prefixes, typos and exact phrase priority", () => {
  const sources = [
    { path: "one", content: "Use `refreshAuthToken` when the provider credential expires." },
    { path: "two", content: "The refresh job sends an auth notification. The token lives elsewhere." },
    { path: "three", content: "Use cursor pagination. Cursor tokens are opaque." },
  ];
  expect(searchSources(sources, "refreshAuthToken")[0].path).toBe("one");
  expect(searchSources(sources, "credential exp")[0].path).toBe("one");
  expect(searchSources(sources, "paginaton")[0].path).toBe("three");
  expect(searchSources(sources, "cursor tokens")[0].exactPhrase).toBe(true);
  expect(searchSources(sources, "unrelatednonexistent")).toEqual([]);
});
test("all eligible whole-record matches remain accessible beyond former count limits", () => {
  const sources = Array.from({ length: 60 }, (_, i) => ({ path: String(i), content: i % 2 ? "alpha beta both" : "alpha only" }));
  expect(searchSources(sources, "alpha beta")).toHaveLength(60);
  expect(searchSources(sources, "alpha beta", 7)).toHaveLength(7);
  expect(searchSources(sources, "alpha beta").every(hit => !("excerpt" in hit))).toBe(true);
});
test("derived index reuse observes same-size source replacement, deletion and fresh IDs", () => {
  const before = [{ path: "one", content: "alpha remembered fact", unit: "record" as const }];
  expect(searchSources(before, "alpha")[0].path).toBe("one");
  expect(searchSources(before, "alpha")[0].matchingWords).toBeGreaterThan(0);
  const after = [{ path: "one", content: "omega remembered fact", unit: "record" as const }];
  expect(before[0].content.length).toBe(after[0].content.length);
  expect(searchSources(after, "alpha")).toEqual([]);
  expect(searchSources(after, "omega")[0].matchingWords).toBeGreaterThan(0);
  expect(searchSources([], "omega")).toEqual([]);
  expect(searchSources([{ ...after[0], path: "new-id" }], "omega")[0].path).toBe("new-id");
});
