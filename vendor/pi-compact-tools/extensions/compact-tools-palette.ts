import type { Theme } from "@earendil-works/pi-coding-agent";
import { indicatorTone, type RowStatus } from "./compact-tools-core.ts";
import {
	colorizeRgb,
	neutralizeRgb,
	themeColorRgb,
	withContrast,
	type Rgb,
} from "./compact-tools-color.ts";

/**
 * Colors this extension draws with, derived from the active theme rather than named on it.
 *
 * Naming a color does not travel. `borderAccent` is a quiet gray in github-dark-pro and
 * electric cyan in Pi's own dark theme; `dim` is the dimmest name a theme offers yet is
 * still sized for body text, a step louder than a rail should be; and a hard-coded white
 * highlight disappears entirely on a light background. So each value here takes a theme
 * color for its hue and then places it: chrome and the indicator give up most of their
 * saturation and are pulled into a fixed contrast band. Everything is measured against the theme
 * background, so the same code reads the same way on light and dark alike: against a light
 * background the moves invert, and standing out means going darker.
 */

type ThemeForeground = Parameters<Theme["getFgAnsi"]>[0];

type ContrastBand = { color: ThemeForeground; keepHue: number; minimum: number; maximum: number };

/**
 * One tone for the whole frame — rails, the result connector, and the status line it leads
 * to — so the frame reads as a single quiet object rather than competing with the output.
 */
const CHROME: ContrastBand = { color: "dim", keepHue: 0.35, minimum: 0.22, maximum: 0.28 };
/**
 * Derivation is deliberately not cached against the Theme: `/theme` can swap a palette behind
 * the same instance, and a stale entry would outlive the switch. Callers that redraw per line
 * hold the derived value themselves instead.
 */
function bandedRgb(theme: Theme, band: ContrastBand): Rgb | undefined {
	const rgb = themeColorRgb(theme, band.color);
	if (!rgb) return undefined;
	return withContrast(theme, neutralizeRgb(rgb, band.keepHue), band.minimum, band.maximum);
}

/**
 * A chrome painter bound to one theme. Deriving the tone costs a parse and a dozen floating
 * point operations, and the frame is drawn once per line of tool output or thinking detail,
 * so callers in a loop take a painter once and callers with a single rail use `paintChrome`.
 */
export function chromePainter(theme: Theme): (text: string) => string {
	const chrome = bandedRgb(theme, CHROME);
	return chrome ? (text) => colorizeRgb(theme, chrome, text) : (text) => theme.fg("dim", text);
}

/** Paint one rail, connector, or status line in the chrome tone. */
export function paintChrome(theme: Theme, text: string): string {
	return chromePainter(theme)(text);
}

/** Fade endpoints for the running tool indicator, or undefined when the theme resolves no RGB. */
/** A row's status dot: muted while waiting or running, then success or error. */
export function paintIndicator(theme: Theme, status: RowStatus): string {
	return theme.fg(indicatorTone(status), "⦁");
}
