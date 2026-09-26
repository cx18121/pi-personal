import { getLanguageFromPath, highlightCode, type Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import {
	Container,
	sliceByColumn,
	stripTerminalSequences,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { normalizeLineEndings } from "./compact-tools-core.ts";
import { highlightMarkdown } from "./compact-tools-markdown.ts";
import { paintChrome } from "./compact-tools-palette.ts";
import type { ToolArgs } from "./compact-tools-types.ts";

class CachedComponent implements Component {
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(
		private readonly renderLines: (width: number) => string[],
		private readonly invalidateSource?: () => void,
	) {}

	render(width: number): string[] {
		if (this.cachedWidth !== width || !this.cachedLines) {
			this.cachedWidth = width;
			this.cachedLines = this.renderLines(width);
		}
		return this.cachedLines;
	}

	invalidate(): void {
		this.invalidateSource?.();
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}
}

/** A Container that does not re-copy all child lines on every fullscreen scroll frame. */
export class CachedContainer extends Container {
	private cachedWidth?: number;
	private cachedLines?: string[];

	private clearRenderCache(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	override addChild(component: Component): void {
		super.addChild(component);
		this.clearRenderCache();
	}

	override removeChild(component: Component): void {
		super.removeChild(component);
		this.clearRenderCache();
	}

	override clear(): void {
		super.clear();
		this.clearRenderCache();
	}

	override render(width: number): string[] {
		if (this.cachedWidth !== width || !this.cachedLines) {
			this.cachedWidth = width;
			this.cachedLines = super.render(width);
		}
		return this.cachedLines;
	}

	override invalidate(): void {
		super.invalidate();
		this.clearRenderCache();
	}
}

export function prefixedText(text: string, firstPrefix: string, continuationPrefix = firstPrefix): Component {
	const prefixWidth = Math.max(visibleWidth(firstPrefix), visibleWidth(continuationPrefix));
	const normalized = text.replace(/\t/g, "   ");
	return new CachedComponent((width) => {
		const lines = wrapTextWithAnsi(normalized, Math.max(1, width - prefixWidth));
		return lines.map((line, index) => `${index === 0 ? firstPrefix : continuationPrefix}${line}`);
	});
}



export function hardWrapTextWithAnsi(text: string, width: number): string[] {
	const safeWidth = Math.max(1, width);
	const wrapped: string[] = [];
	for (const logicalLine of text.replace(/\t/g, "   ").split("\n")) {
		const lineWidth = visibleWidth(logicalLine);
		if (lineWidth === 0) {
			wrapped.push("");
			continue;
		}
		let offset = 0;
		while (offset < lineWidth) {
			if (offset > 0) {
				const remainder = sliceByColumn(logicalLine, offset, lineWidth - offset, true);
				const whitespace = stripTerminalSequences(remainder).match(/^\s+/u)?.[0] ?? "";
				offset += visibleWidth(whitespace);
				if (offset >= lineWidth) break;
			}
			wrapped.push(sliceByColumn(logicalLine, offset, safeWidth, true));
			offset += safeWidth;
		}
	}
	return wrapped;
}

export function renderToolCall(title: string, details: string | undefined, theme: Theme): Component {
	const text = details ? `${title} ${details}` : title;
	const firstPrefix = " ";
	const continuationPrefix = paintChrome(theme, " │ ");
	const prefixWidth = visibleWidth(continuationPrefix);
	return new CachedComponent((width) => {
		const lines = hardWrapTextWithAnsi(text, width - prefixWidth);
		return lines.map((line, index) => `${index === 0 ? firstPrefix : continuationPrefix}${line}`);
	});
}

export function styleMultiline(text: string, style: (line: string) => string): string {
	return normalizeLineEndings(text).split("\n").map(style).join("\n");
}

export function renderOutput(output: string, theme: Theme, isError: boolean): Component | undefined {
	const normalized = normalizeLineEndings(output).trimEnd();
	if (!normalized) return undefined;
	const color = isError ? "error" : "toolOutput";
	const styled = normalized.split("\n").map((line) => theme.fg(color, line)).join("\n");
	return prefixedText(styled, paintChrome(theme, " │ "));
}

type CodeLine = { lineNumber: number; content: string };

/** Past these sizes syntax highlighting costs more than it helps; mirrors Codex's diff renderer. */
const HIGHLIGHT_MAX_CHARS = 512 * 1024;
const HIGHLIGHT_MAX_LINES = 10_000;
const HIGHLIGHT_MAX_LINE_CHARS = 4 * 1024;

function canHighlight(lines: readonly CodeLine[]): boolean {
	if (lines.length > HIGHLIGHT_MAX_LINES) return false;
	let total = 0;
	for (const line of lines) {
		if (line.content.length > HIGHLIGHT_MAX_LINE_CHARS) return false;
		total += line.content.length + 1;
		if (total > HIGHLIGHT_MAX_CHARS) return false;
	}
	return true;
}

function highlightCodeLines(lines: CodeLine[], language: string | undefined, theme: Theme): string[] {
	const contents = lines.map((line) => line.content);
	if (!language || !canHighlight(lines)) return contents.map((content) => theme.fg("toolOutput", content));
	const highlighted = language === "markdown" ? highlightMarkdown(contents, theme) : highlightCode(contents.join("\n"), language);
	return contents.map((content, index) => highlighted[index] ?? content);
}

function hardSliceAnsi(text: string, width: number): string[] {
	const safeWidth = Math.max(1, width);
	const lineWidth = visibleWidth(text);
	if (lineWidth === 0) return [""];
	const slices: string[] = [];
	for (let offset = 0; offset < lineWidth; offset += safeWidth) {
		slices.push(sliceByColumn(text, offset, safeWidth, true));
	}
	return slices;
}

export type CodeViewOptions = {
	/** File line number of the first code line, e.g. a read's `offset`. */
	startLine?: number;
	/** Dim note rendered below the code, such as a read truncation notice. */
	footer?: string;
};

/** Render file contents with line numbers and syntax highlighting. */
export function renderCodeView(code: string, path: string, theme: Theme, options: CodeViewOptions = {}): Component | undefined {
	const normalized = normalizeLineEndings(code).replace(/\n+$/u, "");
	if (!normalized) return undefined;
	const startLine = Math.max(1, Math.floor(options.startLine ?? 1));
	const lines = normalized.split("\n").map((content, index): CodeLine => ({
		lineNumber: startLine + index,
		content: content.replace(/\t/gu, "   "),
	}));
	const highlighted = highlightCodeLines(lines, getLanguageFromPath(path), theme);
	const numberWidth = String(lines[lines.length - 1]!.lineNumber).length;
	const prefix = paintChrome(theme, " \u2502 ");
	const prefixWidth = visibleWidth(prefix);
	return new CachedComponent((width) => {
		const bodyWidth = Math.max(1, width - prefixWidth);
		const codeWidth = Math.max(1, bodyWidth - numberWidth - 2);
		const output: string[] = [];
		lines.forEach((line, index) => {
			for (const [chunkIndex, chunk] of hardSliceAnsi(highlighted[index] ?? line.content, codeWidth).entries()) {
				const number = (chunkIndex === 0 ? String(line.lineNumber) : "").padStart(numberWidth);
				output.push(prefix + theme.fg("toolDiffContext", `${number}  `) + chunk);
			}
		});
		if (options.footer) {
			for (const line of wrapTextWithAnsi(options.footer, bodyWidth)) output.push(prefix + theme.fg("dim", line));
		}
		return output;
	});
}

export function limitComponentLines(
	component: Component,
	maximumLines: number,
	theme: Theme,
	footer: (omitted: number) => string = (omitted) => paintChrome(theme, " │ ")
		+ theme.fg("toolOutput", `… ${omitted} more ${omitted === 1 ? "line" : "lines"}`),
): Component {
	return new CachedComponent((width) => {
		const lines = component.render(width);
		if (lines.length <= maximumLines) return lines;
		return [...lines.slice(0, maximumLines), footer(lines.length - maximumLines)];
	}, () => component.invalidate?.());
}

/** Indent another renderer's component under the result rail so it reads as part of the row. */
export function railComponent(component: Component, theme: Theme): Component {
	const rail = paintChrome(theme, " │ ");
	const railWidth = visibleWidth(rail);
	return new CachedComponent(
		(width) => component.render(Math.max(1, width - railWidth)).map((line) => rail + line),
		() => component.invalidate?.(),
	);
}

export function renderArguments(args: ToolArgs, theme: Theme): Component {
	const json = JSON.stringify(args, null, 2) ?? "{}";
	const styled = styleMultiline(json, (line) => theme.fg("toolOutput", line));
	return prefixedText(styled, paintChrome(theme, " │ "));
}
