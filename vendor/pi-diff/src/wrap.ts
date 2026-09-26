const ESCAPE_RE = /\x1b\[[0-9;]*m/y;

/** Latest background and foreground escapes in effect after `content`. */
function ansiState(content: string): string {
	let fg = "";
	let bg = "";
	for (const match of content.matchAll(/\x1b\[([0-9;]*)m/g)) {
		const params = match[1] ?? "";
		if (params === "0" || params === "") {
			fg = "";
			bg = "";
		} else if (params === "39") fg = "";
		else if (params === "49") bg = "";
		else if (params.startsWith("38;")) fg = match[0];
		else if (params.startsWith("48;")) bg = match[0];
	}
	return bg + fg;
}

type Cell = { prefix: string; ch: string };

function cells(content: string): { cells: Cell[]; trailing: string } {
	const out: Cell[] = [];
	let prefix = "";
	let index = 0;
	while (index < content.length) {
		ESCAPE_RE.lastIndex = index;
		const escape = ESCAPE_RE.exec(content);
		if (escape) {
			prefix += escape[0];
			index += escape[0].length;
			continue;
		}
		out.push({ prefix, ch: content[index] });
		prefix = "";
		index += 1;
	}
	return { cells: out, trailing: prefix };
}

/** Row ranges over visible characters, breaking at spaces where possible. */
function breakRows(plain: string, width: number, indent: number): Array<[number, number]> {
	const rows: Array<[number, number]> = [];
	let start = 0;
	while (start < plain.length) {
		const avail = rows.length === 0 ? width : width - indent;
		if (plain.length - start <= avail) {
			rows.push([start, plain.length]);
			break;
		}
		const limit = start + avail;
		let space = -1;
		for (let cursor = limit; cursor > start + Math.floor(avail / 3); cursor--) {
			if (plain[cursor] === " ") {
				space = cursor;
				break;
			}
		}
		if (space === -1) {
			rows.push([start, limit]);
			start = limit;
			continue;
		}
		rows.push([start, space]);
		start = space;
		while (start < plain.length && plain[start] === " ") start += 1;
	}
	return rows;
}

/**
 * Wrap ANSI-colored text to `width` columns at word boundaries. Continuation rows
 * repeat the line's leading indentation so wrapped text stays aligned with its
 * first row. Rows beyond `maxRows` are cut with a dim `›`.
 */
export function wrapAnsiWords(
	content: string,
	width: number,
	maxRows: number,
	fillBg: string,
	reset: string,
	moreMarker: string,
): string[] {
	if (width <= 0) return [""];
	const { cells: all, trailing } = cells(content);
	const plain = all.map((cell) => cell.ch).join("");
	const pad = (row: string, used: number) => `${row}${fillBg}${" ".repeat(Math.max(0, width - used))}${reset}`;
	if (plain.length <= width) return [pad(content, plain.length)];

	const leading = plain.length - plain.trimStart().length;
	const indent = Math.min(leading, Math.floor(width / 3));
	const ranges = breakRows(plain, width, indent);
	const rows: string[] = [];
	for (const [rowIndex, [start, end]] of ranges.entries()) {
		const truncated = rowIndex === maxRows - 1 && ranges.length > maxRows;
		const state = ansiState(all.slice(0, start).map((cell) => cell.prefix).join(""));
		const lead = rowIndex === 0 ? "" : `${fillBg}${" ".repeat(indent)}${state}`;
		const used = rowIndex === 0 ? 0 : indent;
		const stop = truncated ? Math.min(end, start + Math.max(0, width - used - 1)) : end;
		let row = lead;
		for (let index = start; index < stop; index++) row += all[index].prefix + all[index].ch;
		if (rowIndex === ranges.length - 1) row += trailing;
		if (truncated) {
			rows.push(pad(`${row}${reset}${moreMarker}`, used + (stop - start) + 1));
			break;
		}
		rows.push(pad(row, used + (stop - start)));
	}
	return rows;
}
