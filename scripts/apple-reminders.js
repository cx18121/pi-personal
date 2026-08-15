const Reminders = Application("Reminders");

const textValue = (value) => String(value ?? "");
const normalize = (value) => textValue(value).trim();
const normalizedLower = (value) => normalize(value).toLowerCase();
const boundedInteger = (value, fallback, minimum, maximum) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
};
const boundedText = (value, maximum) => normalize(value).slice(0, maximum);
const optionalDate = (read) => {
	try {
		const value = read();
		if (!value) {
			return null;
		}
		const date = new Date(value);
		return Number.isFinite(date.getTime()) ? date : null;
	} catch {
		return null;
	}
};
const isoDate = (date) => date?.toISOString() ?? null;
const localDate = (date) => date
	? [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-")
	: null;
const parseInstant = (value, field) => {
	if (!normalize(value)) {
		return null;
	}
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) {
		throw new Error(`${field} is not a valid date and time.`);
	}
	return date;
};
const parseLocalDate = (value) => {
	if (!normalize(value)) {
		return null;
	}
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) {
		throw new Error("allDayDate must be YYYY-MM-DD.");
	}
	const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
	if (localDate(date) !== value) {
		throw new Error("allDayDate is not a valid calendar date.");
	}
	return date;
};

const findList = (name) => {
	if (!normalize(name)) {
		return Reminders.defaultList();
	}
	const matches = Reminders.lists().filter((candidate) => normalizedLower(candidate.name()) === normalizedLower(name));
	if (matches.length === 0) {
		throw new Error(`Apple Reminders list not found: ${name}`);
	}
	if (matches.length > 1) {
		throw new Error(`Multiple Apple Reminders lists are named: ${name}`);
	}
	return matches[0];
};

const reminderRecord = (reminder, listName, includeNotes = true) => {
	const allDay = optionalDate(() => reminder.alldayDueDate());
	const due = allDay ? null : optionalDate(() => reminder.dueDate());
	const alert = optionalDate(() => reminder.remindMeDate());
	return {
		id: normalize(reminder.id()),
		title: normalize(reminder.name()),
		list: listName,
		completed: Boolean(reminder.completed()),
		notes: includeNotes ? boundedText(reminder.body(), 2000) || null : null,
		alertAt: isoDate(alert),
		dueAt: isoDate(due),
		allDayDate: localDate(allDay),
	};
};

const allReminderEntries = () => Reminders.lists().flatMap((list) => {
	const listName = normalize(list.name());
	return list.reminders().map((reminder) => ({
		reminder,
		listName,
		summary: reminderRecord(reminder, listName, false),
	}));
});

const relevantTime = (reminder) => reminder.allDayDate
	? new Date(`${reminder.allDayDate}T00:00:00`).getTime()
	: Date.parse(reminder.dueAt ?? reminder.alertAt ?? "") || Number.POSITIVE_INFINITY;

const listReminders = (request) => {
	const query = normalizedLower(request.query);
	const list = normalizedLower(request.list);
	const includeCompleted = Boolean(request.includeCompleted);
	const limit = boundedInteger(request.limit, 100, 1, 200);
	return allReminderEntries()
		.filter(({ summary }) => includeCompleted || !summary.completed)
		.filter(({ summary }) => !list || normalizedLower(summary.list) === list)
		.filter(({ summary }) => !query || normalizedLower(summary.id).includes(query) || normalizedLower(summary.title).includes(query))
		.sort((left, right) => relevantTime(left.summary) - relevantTime(right.summary) || left.summary.title.localeCompare(right.summary.title))
		.slice(0, limit)
		.map(({ reminder, listName }) => reminderRecord(reminder, listName));
};

const findReminder = (id) => {
	const normalizedId = normalizedLower(id).replace(/^x-apple-reminder:\/\//, "");
	const match = Reminders.lists().flatMap((list) => list.reminders()).find((reminder) => {
		const candidate = normalizedLower(reminder.id()).replace(/^x-apple-reminder:\/\//, "");
		return candidate === normalizedId;
	});
	if (!match) {
		throw new Error(`Apple Reminder not found: ${id}`);
	}
	return match;
};

const createReminder = (request) => {
	const title = normalize(request.title);
	if (!title) {
		throw new Error("A reminder title is required.");
	}
	const properties = { name: title };
	if (request.notes !== undefined) {
		properties.body = textValue(request.notes);
	}
	const alertAt = parseInstant(request.alertAt, "alertAt");
	const dueAt = parseInstant(request.dueAt, "dueAt");
	const allDayDate = parseLocalDate(request.allDayDate);
	if (dueAt && allDayDate) {
		throw new Error("Use either dueAt or allDayDate, not both.");
	}
	if (alertAt) {
		properties.remindMeDate = alertAt;
	}
	if (dueAt) {
		properties.dueDate = dueAt;
	}
	if (allDayDate) {
		properties.alldayDueDate = allDayDate;
	}
	const list = findList(request.list);
	const reminder = Reminders.Reminder(properties);
	list.reminders.push(reminder);
	return reminderRecord(reminder, normalize(list.name()));
};

const updateReminder = (request) => {
	const reminder = findReminder(request.id);
	if (request.title !== undefined) {
		const title = normalize(request.title);
		if (!title) {
			throw new Error("A reminder title cannot be empty.");
		}
		reminder.name = title;
	}
	if (request.notes !== undefined) {
		reminder.body = textValue(request.notes);
	}
	const alertAt = parseInstant(request.alertAt, "alertAt");
	const dueAt = parseInstant(request.dueAt, "dueAt");
	const allDayDate = parseLocalDate(request.allDayDate);
	if (dueAt && allDayDate) {
		throw new Error("Use either dueAt or allDayDate, not both.");
	}
	if (request.alertAt === null) {
		reminder.remindMeDate = null;
	} else if (alertAt) {
		reminder.remindMeDate = alertAt;
	}
	if (request.dueAt === null) {
		reminder.dueDate = null;
	} else if (dueAt) {
		reminder.alldayDueDate = null;
		reminder.dueDate = dueAt;
	}
	if (request.allDayDate === null) {
		reminder.alldayDueDate = null;
	} else if (allDayDate) {
		reminder.dueDate = null;
		reminder.alldayDueDate = allDayDate;
	}
	const listName = normalize(reminder.container().name());
	return reminderRecord(reminder, listName);
};

const completeReminder = (id) => {
	const reminder = findReminder(id);
	reminder.completed = true;
	return { id: normalize(reminder.id()), completed: true };
};

const deleteReminder = (id) => {
	const reminder = findReminder(id);
	const value = { id: normalize(reminder.id()), title: normalize(reminder.name()), deleted: true };
	Reminders.delete(reminder);
	return value;
};

function run(argv) {
	const request = JSON.parse(argv[0] ?? "{}");
	switch (request.operation) {
		case "list":
			return JSON.stringify(listReminders(request));
		case "create":
			return JSON.stringify(createReminder(request));
		case "update":
			return JSON.stringify(updateReminder(request));
		case "complete":
			return JSON.stringify(completeReminder(request.id));
		case "delete":
			return JSON.stringify(deleteReminder(request.id));
		default:
			throw new Error(`Unknown Apple Reminders operation: ${request.operation}`);
	}
}
