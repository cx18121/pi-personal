const Notes = Application("Notes");

const textValue = (value) => String(value ?? "");
const normalize = (value) => textValue(value).trim();
const normalizedLower = (value) => normalize(value).toLowerCase();
const isoDate = (value) => {
	try {
		return new Date(value).toISOString();
	} catch {
		return null;
	}
};
const escapeHtml = (value) => String(value)
	.replaceAll("&", "&amp;")
	.replaceAll("<", "&lt;")
	.replaceAll(">", "&gt;")
	.replaceAll('"', "&quot;")
	.replaceAll("'", "&#39;");
const textHtml = (value) => String(value)
	.split(/\r?\n/)
	.map((line) => `<div>${line ? escapeHtml(line) : "<br>"}</div>`)
	.join("");
const boundedInteger = (value, fallback, minimum, maximum) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
};

const folderEntries = () => {
	const entries = [];
	const seenNotes = new Set();

	const visitFolder = (folder, accountName, parentPath) => {
		const folderName = normalize(folder.name());
		const folderPath = parentPath ? `${parentPath}/${folderName}` : folderName;

		for (const note of folder.notes()) {
			const id = normalize(note.id());
			if (!id || seenNotes.has(id)) {
				continue;
			}
			seenNotes.add(id);
			entries.push({ note, id, account: accountName, folder: folderPath });
		}

		for (const child of folder.folders()) {
			visitFolder(child, accountName, folderPath);
		}
	};

	for (const account of Notes.accounts()) {
		const accountName = normalize(account.name());
		for (const folder of account.folders()) {
			visitFolder(folder, accountName, "");
		}
	}

	return entries;
};

const noteMetadata = ({ note, id, account, folder }) => ({
	id,
	title: normalize(note.name()),
	account,
	folder,
	createdAt: isoDate(note.creationDate()),
	modifiedAt: isoDate(note.modificationDate()),
	passwordProtected: Boolean(note.passwordProtected()),
	shared: Boolean(note.shared()),
});

const findNote = (id) => {
	const entry = folderEntries().find((candidate) => candidate.id === id);
	if (!entry) {
		throw new Error(`Apple Note not found: ${id}`);
	}
	return entry;
};

const findAccount = (name) => {
	if (!normalize(name)) {
		return Notes.defaultAccount();
	}
	const account = Notes.accounts().find((candidate) => normalizedLower(candidate.name()) === normalizedLower(name));
	if (!account) {
		throw new Error(`Apple Notes account not found: ${name}`);
	}
	return account;
};

const findOrCreateFolder = (account, name) => {
	const folderName = normalize(name) || "Pi";
	const existing = account.folders().find((folder) => normalizedLower(folder.name()) === normalizedLower(folderName));
	if (existing) {
		return existing;
	}
	const folder = Notes.Folder({ name: folderName });
	account.folders.push(folder);
	return folder;
};

const createNote = ({ account, folder, title, content }) => {
	const noteTitle = normalize(title);
	if (!noteTitle) {
		throw new Error("A note title is required.");
	}
	const targetAccount = findAccount(account);
	const targetFolder = findOrCreateFolder(targetAccount, folder);
	const body = `<h1>${escapeHtml(noteTitle)}</h1>${content ? textHtml(content) : ""}`;
	const note = Notes.Note({ body });
	targetFolder.notes.push(note);
	return {
		id: normalize(note.id()),
		title: normalize(note.name()),
		account: normalize(targetAccount.name()),
		folder: normalize(targetFolder.name()),
	};
};

const appendToInbox = (request) => {
	const value = textValue(request.text);
	const bullets = Array.isArray(request.bullets)
		? request.bullets.map(normalize).filter(Boolean).slice(0, 6)
		: [];
	if (!value.trim() && bullets.length === 0) {
		throw new Error("Text or bullet points are required.");
	}
	const account = Notes.defaultAccount();
	const folder = findOrCreateFolder(account, "Pi");
	const inbox = folder.notes().find((note) => normalizedLower(note.name()) === "inbox");
	const heading = normalize(request.title);
	const bulletList = bullets.length > 0
		? `<ul>${bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul>`
		: "";
	const entry = [
		"<div><br></div>",
		heading ? `<div><b>${escapeHtml(heading)}</b></div>` : "",
		value.trim() ? textHtml(value) : "",
		bulletList,
	].join("");
	if (inbox) {
		inbox.body = `${inbox.body()}${entry}`;
		return {
			id: normalize(inbox.id()),
			title: normalize(inbox.name()),
			account: normalize(account.name()),
			folder: normalize(folder.name()),
		};
	}
	const note = Notes.Note({ body: `<h1>Inbox</h1>${entry}` });
	folder.notes.push(note);
	return {
		id: normalize(note.id()),
		title: normalize(note.name()),
		account: normalize(account.name()),
		folder: normalize(folder.name()),
	};
};

const listNotes = (request) => {
	const accountQuery = normalizedLower(request.account);
	const folderQuery = normalizedLower(request.folder);
	const limit = boundedInteger(request.limit, 50, 1, 100);
	return folderEntries()
		.filter((entry) => !accountQuery || normalizedLower(entry.account) === accountQuery)
		.filter((entry) => !folderQuery || normalizedLower(entry.folder).includes(folderQuery))
		.map(noteMetadata)
		.sort((left, right) => String(right.modifiedAt).localeCompare(String(left.modifiedAt)))
		.slice(0, limit);
};

const searchNotes = (request) => {
	const query = normalizedLower(request.query);
	if (!query) {
		throw new Error("A search query is required.");
	}
	const limit = boundedInteger(request.limit, 20, 1, 50);
	const matches = [];

	for (const entry of folderEntries()) {
		const protectedNote = Boolean(entry.note.passwordProtected());
		let plaintext = "";
		if (!protectedNote) {
			try {
				plaintext = textValue(entry.note.plaintext());
			} catch {
				plaintext = "";
			}
		}
		const title = normalize(entry.note.name());
		const titleMatches = title.toLowerCase().includes(query);
		const contentIndex = plaintext.toLowerCase().indexOf(query);
		if (!titleMatches && contentIndex === -1) {
			continue;
		}
		const start = Math.max(0, contentIndex - 100);
		const snippet = contentIndex === -1
			? title
			: plaintext.slice(start, start + 400).replace(/\s+/g, " ");
		matches.push({ ...noteMetadata(entry), snippet });
	}

	return matches
		.sort((left, right) => String(right.modifiedAt).localeCompare(String(left.modifiedAt)))
		.slice(0, limit);
};

const readNote = (request) => {
	const entry = findNote(normalize(request.id));
	const metadata = noteMetadata(entry);
	if (metadata.passwordProtected) {
		return { ...metadata, text: null, attachments: [], protected: true };
	}
	const plaintext = textValue(entry.note.plaintext());
	const offset = boundedInteger(request.offset, 0, 0, plaintext.length);
	const limit = boundedInteger(request.limit, 12000, 1, 20000);
	const text = plaintext.slice(offset, offset + limit);
	const attachments = entry.note.attachments().map((attachment) => ({
		id: normalize(attachment.id()),
		name: normalize(attachment.name()),
		url: normalize(attachment.url()),
	}));
	return {
		...metadata,
		text,
		offset,
		totalCharacters: plaintext.length,
		nextOffset: offset + text.length < plaintext.length ? offset + text.length : null,
		attachments,
	};
};

function run(argv) {
	const request = JSON.parse(argv[0] ?? "{}");
	switch (request.operation) {
		case "list":
			return JSON.stringify(listNotes(request));
		case "search":
			return JSON.stringify(searchNotes(request));
		case "read":
			return JSON.stringify(readNote(request));
		case "create":
			return JSON.stringify(createNote(request));
		case "inbox":
			return JSON.stringify(appendToInbox(request));
		default:
			throw new Error(`Unknown Apple Notes operation: ${request.operation}`);
	}
}
