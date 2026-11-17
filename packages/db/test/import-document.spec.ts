import { describe, expect, it } from "bun:test";
import {
	DOCUMENT_ACCEPT,
	documentChecklist,
	documentContentType,
	documentFileProblem,
	documentPathname,
	documentPathPrefix,
	IMPORT_DOCUMENT,
	isDocumentPathOf,
	safeDocumentName,
} from "../src/import-document";

const PDF = "application/pdf";

describe("documentChecklist", () => {
	it("finds an expected label on a file of any stage", () => {
		const invoice = { id: "invoice", name: "Commercial invoice" };
		const packing = { id: "packing", name: "Packing list" };
		const receipt = { id: "receipt", name: "Comprobante de pago" };

		const result = documentChecklist(
			[invoice, packing, receipt],
			[
				{ label: { id: "packing" } },
				{ label: null },
				{ label: { id: "other" } },
				{ label: { id: "packing" } },
			],
		);

		expect(result).toEqual({ present: [packing], missing: [invoice, receipt] });
	});

	it("misses everything when the shipment has no file", () => {
		const invoice = { id: "invoice", name: "Commercial invoice" };

		expect(documentChecklist([invoice], [])).toEqual({
			present: [],
			missing: [invoice],
		});
		expect(documentChecklist([], [{ label: { id: "x" } }])).toEqual({
			present: [],
			missing: [],
		});
	});
});

describe("documentContentType", () => {
	it("reads the type from the extension first", () => {
		expect(documentContentType("Factura.PDF", "")).toBe(PDF);
		expect(documentContentType("costos.csv", "application/vnd.ms-excel")).toBe(
			"text/csv",
		);
		expect(documentContentType("foto.jpeg", "image/jpeg")).toBe("image/jpeg");
		expect(documentContentType("packing.xlsx", "")).toBe(
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		);
	});

	it("falls back to an allowed browser type and refuses the rest", () => {
		expect(documentContentType("sin-extension", "application/pdf")).toBe(PDF);
		expect(documentContentType("archivo.zip", "application/zip")).toBeNull();
		expect(documentContentType("pagina.html", "text/html")).toBeNull();
		expect(documentContentType("raro", "")).toBeNull();
	});

	it("lists every extension for the file picker", () => {
		expect(DOCUMENT_ACCEPT.split(",")).toEqual([
			".pdf",
			".jpg",
			".jpeg",
			".png",
			".webp",
			".xlsx",
			".xls",
			".docx",
			".csv",
			".txt",
		]);
	});
});

describe("documentFileProblem", () => {
	it("accepts an allowed type up to the limit", () => {
		expect(documentFileProblem({ contentType: PDF, size: 1 })).toBeNull();
		expect(
			documentFileProblem({ contentType: PDF, size: IMPORT_DOCUMENT.maxBytes }),
		).toBeNull();
		expect(IMPORT_DOCUMENT.maxBytes).toBe(20 * 1024 * 1024);
	});

	it("names the problem of a bad type, an empty file and a large file", () => {
		expect(documentFileProblem({ contentType: "text/html", size: 10 })).toBe(
			"TYPE",
		);
		expect(documentFileProblem({ contentType: PDF, size: 0 })).toBe("EMPTY");
		expect(
			documentFileProblem({
				contentType: PDF,
				size: IMPORT_DOCUMENT.maxBytes + 1,
			}),
		).toBe("TOO_LARGE");
	});
});

describe("paths", () => {
	it("makes a safe name that keeps the extension", () => {
		expect(safeDocumentName("Factura PI ñandú (1).PDF")).toBe(
			"Factura-PI-nandu-1.pdf",
		);
		expect(safeDocumentName(".pdf")).toBe("archivo.pdf");
		expect(safeDocumentName("sin extension")).toBe("sin-extension");
		expect(safeDocumentName("../../etc")).not.toContain("/");
		expect(
			safeDocumentName(`${"a".repeat(200)}.pdf`).length,
		).toBeLessThanOrEqual(IMPORT_DOCUMENT.safeNameMaxLength + 4);
	});

	it("builds the pathname under the shipment and the event", () => {
		const pathname = documentPathname({
			shipmentId: "s1",
			eventId: "e1",
			nonce: "n1",
			filename: "Packing list.xlsx",
		});

		expect(documentPathPrefix("s1", "e1")).toBe("import-documents/s1/e1/");
		expect(pathname).toBe("import-documents/s1/e1/n1-Packing-list.xlsx");
		expect(isDocumentPathOf(pathname, "s1", "e1")).toBe(true);
	});

	it("refuses a path of another event, a nested path and a bare prefix", () => {
		expect(
			isDocumentPathOf("import-documents/s1/e2/n1-a.pdf", "s1", "e1"),
		).toBe(false);
		expect(
			isDocumentPathOf("import-documents/s2/e1/n1-a.pdf", "s1", "e1"),
		).toBe(false);
		expect(
			isDocumentPathOf("import-documents/s1/e1/x/../a.pdf", "s1", "e1"),
		).toBe(false);
		expect(isDocumentPathOf("import-documents/s1/e1/", "s1", "e1")).toBe(false);
		expect(isDocumentPathOf("other/s1/e1/n1-a.pdf", "s1", "e1")).toBe(false);
	});
});
