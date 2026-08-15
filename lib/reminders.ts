export interface ReminderRecord {
	id: string;
	title: string;
	list: string;
	completed: boolean;
	notes: string | null;
	alertAt: string | null;
	dueAt: string | null;
	allDayDate: string | null;
}

export interface ReminderGroups {
	overdue: ReminderRecord[];
	today: ReminderRecord[];
	nextSevenDays: ReminderRecord[];
	noDate: ReminderRecord[];
	later: ReminderRecord[];
}

const isNullableString = (value: unknown) => value === null || typeof value === "string";

const isReminderRecord = (value: unknown): value is ReminderRecord => typeof value === "object"
	&& value !== null
	&& "id" in value
	&& typeof value.id === "string"
	&& "title" in value
	&& typeof value.title === "string"
	&& "list" in value
	&& typeof value.list === "string"
	&& "completed" in value
	&& typeof value.completed === "boolean"
	&& "notes" in value
	&& isNullableString(value.notes)
	&& "alertAt" in value
	&& isNullableString(value.alertAt)
	&& "dueAt" in value
	&& isNullableString(value.dueAt)
	&& "allDayDate" in value
	&& isNullableString(value.allDayDate);

export const parseReminderList = (value: unknown) => {
	if (!Array.isArray(value) || !value.every(isReminderRecord)) {
		throw new Error("Apple Reminders returned an invalid reminder list.");
	}
	return value;
};

const localDateKey = (date: Date) => [
	date.getFullYear(),
	String(date.getMonth() + 1).padStart(2, "0"),
	String(date.getDate()).padStart(2, "0"),
].join("-");

const reminderDate = (reminder: ReminderRecord) => {
	if (reminder.allDayDate) {
		return new Date(`${reminder.allDayDate}T00:00:00`);
	}
	const value = reminder.dueAt ?? reminder.alertAt;
	return value ? new Date(value) : null;
};

export const groupReminders = (reminders: ReminderRecord[], now: Date): ReminderGroups => {
	const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const startOfTomorrow = new Date(startOfToday);
	startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
	const endOfWindow = new Date(startOfToday);
	endOfWindow.setDate(endOfWindow.getDate() + 8);

	return reminders.reduce<ReminderGroups>((groups, reminder) => {
		const date = reminderDate(reminder);
		if (!date) {
			return { ...groups, noDate: [...groups.noDate, reminder] };
		}
		if (date < startOfToday) {
			return { ...groups, overdue: [...groups.overdue, reminder] };
		}
		if (date < startOfTomorrow) {
			return { ...groups, today: [...groups.today, reminder] };
		}
		if (date < endOfWindow) {
			return { ...groups, nextSevenDays: [...groups.nextSevenDays, reminder] };
		}
		return { ...groups, later: [...groups.later, reminder] };
	}, { overdue: [], today: [], nextSevenDays: [], noDate: [], later: [] });
};

export const timingSummary = (reminder: ReminderRecord) => [
	reminder.allDayDate ? `all day ${reminder.allDayDate}` : null,
	reminder.dueAt ? `due ${reminder.dueAt}` : null,
	reminder.alertAt ? `notify ${reminder.alertAt}` : null,
].filter((value) => value !== null).join(" · ") || "no date";

export const reminderSummary = (reminder: ReminderRecord) => [
	reminder.title,
	`List: ${reminder.list}`,
	`Timing: ${timingSummary(reminder)}`,
	reminder.notes ? `Notes: ${reminder.notes}` : null,
	`ID: ${reminder.id}`,
].filter((value) => value !== null).join("\n");

const isDateOnly = (value: string) => {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) {
		return false;
	}
	const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
	return localDateKey(date) === value;
};

const isAbsoluteDateTime = (value: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
	&& Number.isFinite(Date.parse(value));

export const validateReminderDates = (values: { alertAt?: string | null; dueAt?: string | null; allDayDate?: string | null }) => {
	if (values.alertAt !== undefined && values.alertAt !== null && !isAbsoluteDateTime(values.alertAt)) {
		return "alertAt must be an absolute ISO 8601 date and time with a UTC offset.";
	}
	if (values.dueAt !== undefined && values.dueAt !== null && !isAbsoluteDateTime(values.dueAt)) {
		return "dueAt must be an absolute ISO 8601 date and time with a UTC offset.";
	}
	if (values.allDayDate !== undefined && values.allDayDate !== null && !isDateOnly(values.allDayDate)) {
		return "allDayDate must be YYYY-MM-DD.";
	}
	if (values.dueAt && values.allDayDate) {
		return "Use either dueAt or allDayDate, not both.";
	}
	return null;
};
