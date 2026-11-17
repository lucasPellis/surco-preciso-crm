import { describe, expect, it } from "bun:test";
import {
	type DocumentLabelRow,
	type ExpectedLabel,
	fileSizeLabel,
	groupLabelsForStage,
	labelFromChoice,
	labelOptionText,
	missingDocumentsText,
	NO_LABEL,
	type ShipmentDocument,
	splitDocumentLabels,
	stageChecklists,
	suggestedLabelId,
} from "../lib/import-documents";
import type { ImportStageOption } from "../lib/import-orders";

const invoice: ExpectedLabel = {
	id: "invoice",
	name: "Commercial invoice",
	direction: "IN",
	archived: false,
};
const packing: ExpectedLabel = {
	id: "packing",
	name: "Packing list",
	direction: "IN",
	archived: false,
};
const receipt: ExpectedLabel = {
	id: "receipt",
	name: "Comprobante de pago",
	direction: "OUT",
	archived: false,
};

function stage(
	key: string,
	expectedLabels: ExpectedLabel[],
	kind: ImportStageOption["kind"] = "IN_PROGRESS",
): ImportStageOption {
	return { key, name: key, kind, tone: "NEUTRAL", expectedLabels };
}

function file(label: ExpectedLabel | null): ShipmentDocument {
	return {
		id: `f-${label?.id ?? "none"}`,
		filename: "a.pdf",
		contentType: "application/pdf",
		size: 10,
		uploadedAt: "2026-01-10T12:00:00.000Z",
		uploadedByName: null,
		eventId: "e-1",
		stage: { key: "DOCS", name: "DOCS" },
		label,
	};
}

describe("stage checklists", () => {
	it("counts a file of one stage at every stage that expects its label", () => {
		const stages = [
			stage("DOCS", [invoice, packing]),
			stage("PAGO", []),
			stage("BANCO", [invoice, packing, receipt]),
			stage("CANCELADO", [invoice], "CANCELLED"),
		];

		expect(stageChecklists(stages, [file(packing), file(null)])).toEqual([
			{ key: "DOCS", name: "DOCS", present: [packing], missing: [invoice] },
			{
				key: "BANCO",
				name: "BANCO",
				present: [packing],
				missing: [invoice, receipt],
			},
		]);
	});

	it("writes the move warning for the target stage", () => {
		const bank = stage("BANCO", [invoice, packing, receipt]);

		expect(missingDocumentsText(bank, [file(invoice), file(receipt)])).toBe(
			"Falta: Packing list. Puedes moverlo igual.",
		);
		expect(missingDocumentsText(bank, [file(packing)])).toBe(
			"Faltan: Commercial invoice, Comprobante de pago. Puedes moverlo igual.",
		);
		expect(
			missingDocumentsText(bank, [file(invoice), file(packing), file(receipt)]),
		).toBeNull();
		expect(missingDocumentsText(stage("PAGO", []), [])).toBeNull();
		expect(missingDocumentsText(undefined, [])).toBeNull();
	});

	it("suggests the first missing label", () => {
		const docs = stage("DOCS", [invoice, packing]);

		expect(suggestedLabelId(docs, [file(invoice)])).toBe("packing");
		expect(suggestedLabelId(docs, [file(invoice), file(packing)])).toBeNull();
		expect(suggestedLabelId(undefined, [])).toBeNull();
	});
});

describe("label groups", () => {
	const rows: DocumentLabelRow[] = [
		{ ...receipt, fileCount: 0, stageCount: 1 },
		{ ...packing, fileCount: 0, stageCount: 1 },
		{ ...invoice, fileCount: 0, stageCount: 1 },
	];

	it("puts the expected labels of the stage first, in stage order", () => {
		const groups = groupLabelsForStage(rows, stage("DOCS", [invoice, packing]));

		expect(groups.stage.map((row) => row.id)).toEqual(["invoice", "packing"]);
		expect(groups.other.map((row) => row.id)).toEqual(["receipt"]);
	});

	it("leaves every label in the other group without a stage", () => {
		expect(groupLabelsForStage(rows, undefined)).toEqual({
			stage: [],
			other: rows,
		});
		expect(
			groupLabelsForStage(rows, stage("PAGO", [])).other.map((row) => row.id),
		).toEqual(["receipt", "packing", "invoice"]);
	});

	it("ignores expected labels that are not active", () => {
		const groups = groupLabelsForStage(
			rows.filter((row) => row.id !== "invoice"),
			stage("DOCS", [invoice, packing]),
		);

		expect(groups.stage.map((row) => row.id)).toEqual(["packing"]);
	});
});

describe("labels and sizes", () => {
	it("splits labels and names them with their direction", () => {
		const rows: DocumentLabelRow[] = [
			{ ...invoice, fileCount: 1, stageCount: 2 },
			{ ...receipt, archived: true, fileCount: 0, stageCount: 0 },
		];

		const { active, archived } = splitDocumentLabels(rows);

		expect(active.map((row) => row.id)).toEqual(["invoice"]);
		expect(archived.map((row) => row.id)).toEqual(["receipt"]);
		expect(labelOptionText(invoice)).toBe("Commercial invoice, Entrada");
		expect(labelOptionText(receipt)).toBe("Comprobante de pago, Salida");
		expect(labelFromChoice(NO_LABEL)).toBeNull();
		expect(labelFromChoice("invoice")).toBe("invoice");
	});

	it("writes a file size in KB or MB", () => {
		expect(fileSizeLabel(10)).toBe("1 KB");
		expect(fileSizeLabel(2048)).toBe("2 KB");
		expect(fileSizeLabel(1.5 * 1024 * 1024)).toBe("1,5 MB");
		expect(fileSizeLabel(20 * 1024 * 1024)).toBe("20 MB");
	});
});
