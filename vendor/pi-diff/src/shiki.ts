// Pi's compiled runtime cannot resolve the bare dynamic imports Shiki uses to
// lazy-load themes, grammars, and its WASM engine. Load them statically and use
// the JavaScript regex engine instead. Mirrors @shikijs/cli's codeToANSI output.
import { createHighlighterCore, type HighlighterCore, type ThemeRegistrationResolved } from "@shikijs/core";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import bash from "@shikijs/langs/bash";
import c from "@shikijs/langs/c";
import cpp from "@shikijs/langs/cpp";
import csharp from "@shikijs/langs/csharp";
import css from "@shikijs/langs/css";
import dart from "@shikijs/langs/dart";
import go from "@shikijs/langs/go";
import graphql from "@shikijs/langs/graphql";
import html from "@shikijs/langs/html";
import java from "@shikijs/langs/java";
import javascript from "@shikijs/langs/javascript";
import json from "@shikijs/langs/json";
import jsx from "@shikijs/langs/jsx";
import kotlin from "@shikijs/langs/kotlin";
import lua from "@shikijs/langs/lua";
import markdown from "@shikijs/langs/markdown";
import php from "@shikijs/langs/php";
import python from "@shikijs/langs/python";
import ruby from "@shikijs/langs/ruby";
import rust from "@shikijs/langs/rust";
import scss from "@shikijs/langs/scss";
import sql from "@shikijs/langs/sql";
import svelte from "@shikijs/langs/svelte";
import swift from "@shikijs/langs/swift";
import toml from "@shikijs/langs/toml";
import tsx from "@shikijs/langs/tsx";
import typescript from "@shikijs/langs/typescript";
import vue from "@shikijs/langs/vue";
import xml from "@shikijs/langs/xml";
import yaml from "@shikijs/langs/yaml";
import githubDark from "@shikijs/themes/github-dark";
import githubLight from "@shikijs/themes/github-light";

export type BundledLanguage = string;
export type BundledTheme = string;

const LANGS = [
	bash, c, cpp, csharp, css, dart, go, graphql, html, java, javascript, json, jsx, kotlin, lua, markdown,
	php, python, ruby, rust, scss, sql, svelte, swift, toml, tsx, typescript, vue, xml, yaml,
];
const THEMES = [githubDark, githubLight];
const FALLBACK_THEME = "github-dark";

let highlighter: Promise<HighlighterCore> | undefined;

function getHighlighter(): Promise<HighlighterCore> {
	highlighter ??= createHighlighterCore({ themes: THEMES, langs: LANGS, engine: createJavaScriptRegexEngine() });
	return highlighter;
}

function applyAlpha(hex: string, type: ThemeRegistrationResolved["type"]): [number, number, number] {
	let h = hex.replace("#", "");
	if (h.length === 3 || h.length === 4) h = [...h].map((ch) => ch + ch).join("");
	if (h.length === 6) h += "ff";
	const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
	const a = Number.parseInt(h.slice(6, 8), 16) / 255;
	const mix = (v: number) => Math.round(type === "light" ? v * a + 255 * (1 - a) : v * a);
	return [mix(r), mix(g), mix(b)];
}

export async function codeToANSI(code: string, lang: BundledLanguage, theme: BundledTheme): Promise<string> {
	const hl = await getHighlighter();
	const themeName = hl.getLoadedThemes().includes(theme) ? theme : FALLBACK_THEME;
	const themeReg = hl.getTheme(themeName);
	let output = "";
	for (const line of hl.codeToTokensBase(code, { lang, theme: themeName })) {
		for (const token of line) {
			let text = token.content;
			const color = token.color || themeReg.fg;
			if (color) {
				const [r, g, b] = applyAlpha(color, themeReg.type);
				text = `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
			}
			const style = token.fontStyle ?? 0;
			if (style & 1) text = `\x1b[3m${text}\x1b[23m`;
			if (style & 2) text = `\x1b[1m${text}\x1b[22m`;
			if (style & 4) text = `\x1b[4m${text}\x1b[24m`;
			output += text;
		}
		output += "\n";
	}
	return output;
}
