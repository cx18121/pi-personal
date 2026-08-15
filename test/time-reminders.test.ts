import assert from "node:assert/strict";
import test from "node:test";
import { groupReminders, type ReminderRecord, validateReminderDates } from "../lib/reminders.ts";
import { createTimeContext, localIsoDateTime } from "../lib/time-context.ts";

const reminder = (values: Partial<ReminderRecord> & Pick<ReminderRecord, "id" | "title">): ReminderRecord => ({
	id: values.id,
	title: values.title,
	list: values.list ?? "Reminders",
	completed: values.completed ?? false,
	notes: values.notes ?? null,
	alertAt: values.alertAt ?? null,
	dueAt: values.dueAt ?? null,
	allDayDate: values.allDayDate ?? null,
});

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

test("groups reminders by their next meaningful date", () => {
	const groups = groupReminders([
		reminder({ id: "overdue", title: "Overdue", dueAt: new Date(2026, 7, 14, 12).toISOString() }),
		reminder({ id: "today", title: "Today", alertAt: new Date(2026, 7, 15, 15).toISOString() }),
		reminder({ id: "soon", title: "Soon", allDayDate: "2026-08-18" }),
		reminder({ id: "later", title: "Later", allDayDate: "2026-08-30" }),
		reminder({ id: "none", title: "No date" }),
	], new Date(2026, 7, 15, 10));

	assert.deepEqual(groups.overdue.map(({ id }) => id), ["overdue"]);
	assert.deepEqual(groups.today.map(({ id }) => id), ["today"]);
	assert.deepEqual(groups.nextSevenDays.map(({ id }) => id), ["soon"]);
	assert.deepEqual(groups.later.map(({ id }) => id), ["later"]);
	assert.deepEqual(groups.noDate.map(({ id }) => id), ["none"]);
});

test("uses a due date before an earlier notification when grouping", () => {
	const groups = groupReminders([
		reminder({
			id: "homework",
			title: "Homework",
			alertAt: new Date(2026, 7, 14, 12).toISOString(),
			dueAt: new Date(2026, 7, 18, 12).toISOString(),
		}),
	], new Date(2026, 7, 15, 10));

	assert.deepEqual(groups.nextSevenDays.map(({ id }) => id), ["homework"]);
	assert.equal(groups.overdue.length, 0);
});

test("validates all-day and absolute reminder dates", () => {
	assert.equal(validateReminderDates({ alertAt: "" }), "alertAt must be an absolute ISO 8601 date and time with a UTC offset.");
	assert.equal(validateReminderDates({ dueAt: "" }), "dueAt must be an absolute ISO 8601 date and time with a UTC offset.");
	assert.equal(validateReminderDates({ allDayDate: "" }), "allDayDate must be YYYY-MM-DD.");
	assert.equal(validateReminderDates({ allDayDate: "2026-02-29" }), "allDayDate must be YYYY-MM-DD.");
	assert.equal(validateReminderDates({ allDayDate: "2028-02-29" }), null);
	assert.equal(validateReminderDates({ alertAt: "2026-08-15T12:00:00" }), "alertAt must be an absolute ISO 8601 date and time with a UTC offset.");
	assert.equal(validateReminderDates({ alertAt: "2026-08-15T12:00:00+02:00" }), null);
	assert.equal(validateReminderDates({ dueAt: "2026-08-15T12:00:00Z" }), null);
	assert.equal(validateReminderDates({ dueAt: null, alertAt: null, allDayDate: null }), null);
	assert.equal(
		validateReminderDates({ dueAt: "2026-08-15T12:00:00Z", allDayDate: "2026-08-15" }),
		"Use either dueAt or allDayDate, not both.",
	);
});
