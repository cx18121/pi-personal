import assert from "node:assert/strict";
import test from "node:test";
import { createTimeContext, localIsoDateTime } from "../lib/time-context.ts";

test("reports local time and elapsed session time", () => {
	const started = new Date("2026-08-15T08:00:00Z");
	const now = new Date("2026-08-15T09:02:03Z");
	const context = createTimeContext(now, started, "UTC");

	assert.equal(context.localDateTime, localIsoDateTime(now));
	assert.equal(context.weekday, "Saturday");
	assert.equal(context.timeZone, "UTC");
	assert.equal(context.sessionStartedAt, localIsoDateTime(started));
	assert.equal(context.sessionElapsedSeconds, 3723);
	assert.match(localIsoDateTime(new Date()), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
});
