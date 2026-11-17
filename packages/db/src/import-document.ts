const KB = 1024;
const MB = 1024 * KB;
const MINUTE_MS = 60_000;
const MAX_MEGABYTES = 20;

type DocumentKind = { type: string; extensions: readonly string[] };

const DOCUMENT_KINDS: readonly DocumentKind[] = [
	{ type: "application/pdf", extensions: ["pdf"] },
	{ type: "image/jpeg", extensions: ["jpg", "jpeg"] },
	{ type: "image/png", extensions: ["png"] },
	{ type: "image/webp", extensions: ["webp"] },
	{
		type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		extensions: ["xlsx"],
	},
	{ type: "application/vnd.ms-excel", extensions: ["xls"] },
	{
		type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		extensions: ["docx"],
	},
	{ type: "text/csv", extensions: ["csv"] },
	{ type: "text/plain", extensions: ["txt"] },
];

export const IMPORT_DOCUMENT = {
	pathPrefix: "import-documents",
	access: "private",
	maxMegabytes: MAX_MEGABYTES,
	maxBytes: MAX_MEGABYTES * MB,
	filenameMaxLength: 200,
	safeNameMaxLength: 80,
	fallbackName: "archivo",
	labelNameMaxLength: 60,
	maxExpectedLabels: 20,
	uploadTokenTtlMs: 10 * MINUTE_MS,
	downloadUrlTtlMs: 5 * MINUTE_MS,
	kinds: DOCUMENT_KINDS,
} as const;

export type DocumentProblem = "TYPE" | "EMPTY" | "TOO_LARGE";

export const DOCUMENT_PROBLEM_MESSAGES = {
	TYPE: "Ese tipo de archivo no se acepta. Sube un PDF, una imagen, un Excel, un Word, un CSV o un texto.",
	EMPTY: "El archivo está vacío.",
	TOO_LARGE: `El archivo pasa el máximo de ${MAX_MEGABYTES} MB.`,
} satisfies Record<DocumentProblem, string>;

export const DOCUMENT_ACCEPT = DOCUMENT_KINDS.flatMap((kind) =>
	kind.extensions.map((extension) => `.${extension}`),
).join(",");

export type FileShape = { contentType: string; size: number };

export type LabelRef = { id: string };

export type DocumentChecklist<Label extends LabelRef> = {
	present: Label[];
	missing: Label[];
};

function extensionOf(filename: string): string {
	const dot = filename.lastIndexOf(".");
	return dot < 0 ? "" : filename.slice(dot + 1).toLowerCase();
}

function isAllowedType(value: string): boolean {
	return DOCUMENT_KINDS.some((kind) => kind.type === value);
}

export function documentContentType(
	filename: string,
	browserType: string,
): string | null {
	const extension = extensionOf(filename);
	const byExtension = DOCUMENT_KINDS.find((kind) =>
		kind.extensions.includes(extension),
	);
	if (byExtension) return byExtension.type;
	const declared = browserType.split(";")[0]?.trim().toLowerCase() ?? "";
	return isAllowedType(declared) ? declared : null;
}

export function documentFileProblem(file: FileShape): DocumentProblem | null {
	if (!isAllowedType(file.contentType)) return "TYPE";
	if (!Number.isInteger(file.size) || file.size < 1) return "EMPTY";
	if (file.size > IMPORT_DOCUMENT.maxBytes) return "TOO_LARGE";
	return null;
}

function cleanPart(value: string): string {
	return value
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^A-Za-z0-9._-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^[-.]+|[-.]+$/g, "");
}

export function safeDocumentName(filename: string): string {
	const extension = extensionOf(filename);
	const base = extension
		? filename.slice(0, filename.length - extension.length - 1)
		: filename;
	const stem =
		cleanPart(base)
			.slice(0, IMPORT_DOCUMENT.safeNameMaxLength)
			.replace(/[-.]+$/, "") || IMPORT_DOCUMENT.fallbackName;
	const suffix = cleanPart(extension).toLowerCase();
	return suffix ? `${stem}.${suffix}` : stem;
}

export function documentPathPrefix(
	shipmentId: string,
	eventId: string,
): string {
	return `${IMPORT_DOCUMENT.pathPrefix}/${shipmentId}/${eventId}/`;
}

export function documentPathname(input: {
	shipmentId: string;
	eventId: string;
	nonce: string;
	filename: string;
}): string {
	return `${documentPathPrefix(input.shipmentId, input.eventId)}${input.nonce}-${safeDocumentName(input.filename)}`;
}

export function isDocumentPathOf(
	pathname: string,
	shipmentId: string,
	eventId: string,
): boolean {
	const prefix = documentPathPrefix(shipmentId, eventId);
	if (!pathname.startsWith(prefix)) return false;
	const rest = pathname.slice(prefix.length);
	return rest.length > 0 && !rest.includes("/");
}

export function documentChecklist<Label extends LabelRef>(
	expected: readonly Label[],
	documents: ReadonlyArray<{ label: LabelRef | null }>,
): DocumentChecklist<Label> {
	const found = new Set(
		documents.flatMap((document) =>
			document.label ? [document.label.id] : [],
		),
	);
	return {
		present: expected.filter((label) => found.has(label.id)),
		missing: expected.filter((label) => !found.has(label.id)),
	};
}
