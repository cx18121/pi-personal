export interface TimeContext {
	localDateTime: string;
	weekday: string;
	timeZone: string;
	sessionStartedAt: string;
	sessionElapsedSeconds: number;
}

const pad = (value: number) => String(value).padStart(2, "0");

const formatOffset = (offsetMinutes: number) => {
	const sign = offsetMinutes >= 0 ? "+" : "-";
	const absolute = Math.abs(offsetMinutes);
	return `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
};

export const localIsoDateTime = (date: Date) => [
	`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
	`${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
].join("T") + formatOffset(-date.getTimezoneOffset());

export const createTimeContext = (now: Date, sessionStartedAt: Date, timeZone: string): TimeContext => ({
	localDateTime: localIsoDateTime(now),
	weekday: new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone }).format(now),
	timeZone,
	sessionStartedAt: localIsoDateTime(sessionStartedAt),
	sessionElapsedSeconds: Math.max(0, Math.floor((now.getTime() - sessionStartedAt.getTime()) / 1000)),
});
