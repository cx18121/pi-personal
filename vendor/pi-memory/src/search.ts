import { createHash } from "node:crypto";
import MiniSearch from "minisearch";
import { isMetadataLine } from "./format.js";

export interface SearchSource { path: string; content: string; unit?: "record" }
export interface SearchResult { path: string; score: number; exactPhrase: boolean; matchingWords: number; partialMatches: number }
function identifierParts(term: string) {
  return term.split(/[^\p{L}\p{N}]+/u).filter(Boolean).flatMap(part =>
    part.match(/\p{Lu}+(?=\p{Lu}\p{Ll}|\p{N}|$)|\p{Lu}?\p{Ll}+|\p{N}+/gu) ?? [part]).map(part => part.toLocaleLowerCase());
}
function searchTokens(text: string) {
  return (text.match(/[\p{L}\p{N}_./:@+-]+/gu) ?? []).flatMap(term => [...new Set([term.toLocaleLowerCase(), ...identifierParts(term)])]);
}
function clean(text: string) {
  return text.replace(/\r\n?/g, "\n").split("\n").filter(line => !isMetadataLine(line)).map(line => line
    .replace(/^\s{0,3}#{1,6}\s+/, "").replace(/^\s*>\s?/, "").replace(/^\s*(?:[-*+] |\d+[.)] )/, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 $2").replace(/[`*~]/g, ""))
    .join("\n").replace(/[ \t]+/g, " ").trim();
}
function phrase(text: string) { return clean(text).replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").replace(/\s+/g, " ").toLocaleLowerCase(); }
function exact(text: string, query: string) {
  let index = text.indexOf(query);
  while (index >= 0) {
    const boundary = (position: number, direction: number, edge: string) => {
      const character = text[position];
      if (character === undefined) return true;
      if (/[\p{L}\p{N}_]/u.test(character)) return false;
      if (!/[./:@+-]/u.test(character)) return true;
      if (character === edge) return false;
      const beyond = text[position + direction];
      return beyond === undefined || !/[\p{L}\p{N}_./:@+-]/u.test(beyond);
    };
    if (boundary(index - 1, -1, query[0]) && boundary(index + query.length, 1, query.at(-1)!)) return true;
    index = text.indexOf(query, index + 1);
  }
  return false;
}
interface Document { id: number; path: string; body: string; source: string; identifiers: string; normalized: string; tokens: string[] }
const indexes = new Map<string, MiniSearch<Document>>();
function indexFor(sources: SearchSource[]) {
  const key = createHash("sha256").update(JSON.stringify(sources)).digest("hex");
  const cached = indexes.get(key);
  if (cached) { indexes.delete(key); indexes.set(key, cached); return cached; }
  const documents = sources.map((source, id) => {
    const body = clean(source.content);
    const identifiers = (body.match(/[\p{L}\p{N}_./:@+-]+/gu) ?? []).filter(token => /[_./:@+-]|[a-z][A-Z]/.test(token)).join(" ");
    return { id, path: source.path, body, source: source.unit === "record" ? "" : source.path, identifiers, normalized: phrase(body), tokens: [...new Set(searchTokens(body))] };
  }).filter(document => document.body);
  if (!documents.length) return null;
  const index = new MiniSearch<Document>({ fields: ["body", "source", "identifiers"], storeFields: ["path", "normalized", "tokens"], tokenize: searchTokens });
  index.addAll(documents); indexes.set(key, index);
  // Cache capacity controls resident derived state, never candidate coverage.
  if (indexes.size > 2) indexes.delete(indexes.keys().next().value!);
  return index;
}

/** Every eligible lexical candidate remains accessible; AND matches do not hide OR matches. */
export function searchSources(sources: SearchSource[], query: string, limit?: number): SearchResult[] {
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit <= 0)) throw new Error("Limit must be a positive integer.");
  const normalized = phrase(query), words = [...new Set(searchTokens(query))];
  if (!normalized || !words.length) return [];
  const index = indexFor(sources); if (!index) return [];
  const options = { boost: { body: 1, source: 1.5, identifiers: 2 }, combineWith: "OR" as const,
    prefix: (term: string, position: number, terms: string[]) => term.length >= 3 && position === terms.length - 1,
    weights: { prefix: 0.5, fuzzy: 0.25 } };
  const matches = index.search(query, options);
  const fuzzy = index.search(query, { ...options, fuzzy: (term: string) => term.length >= 5 && /^[\p{L}\p{N}]+$/u.test(term) ? 1 : false, maxFuzzy: 1 });
  const union = new Map(matches.map(match => [match.id, match]));
  for (const match of fuzzy) if (!union.has(match.id)) union.set(match.id, match);
  const ranked = [...union.values()].map(match => {
    const text = String(match.normalized), tokens = new Set<string>(match.tokens);
    return { path: String(match.path), score: match.score, exactPhrase: exact(text, normalized), matchingWords: words.filter(word => tokens.has(word)).length,
      partialMatches: words.filter(word => exact(text, word)).length };
  }).sort((left, right) => Number(right.exactPhrase) - Number(left.exactPhrase) || right.score - left.score || right.matchingWords - left.matchingWords ||
    right.partialMatches - left.partialMatches || left.path.localeCompare(right.path));
  return limit === undefined ? ranked : ranked.slice(0, limit);
}
