import { describe, expect, it } from "bun:test";
import { ImportStageKind } from "../src/generated/prisma/enums";
import {
	IMPORT_STAGE,
	isClosedImportKind,
	isFixedImportStage,
} from "../src/import-stage";

describe("fixed import stages", () => {
	it("treats the entry, received and cancelled stages as fixed", () => {
		expect(
			isFixedImportStage({ isEntry: true, kind: ImportStageKind.IN_PROGRESS }),
		).toBe(true);
		expect(
			isFixedImportStage({ isEntry: false, kind: ImportStageKind.RECEIVED }),
		).toBe(true);
		expect(
			isFixedImportStage({ isEntry: false, kind: ImportStageKind.CANCELLED }),
		).toBe(true);
	});

	it("treats every other in-progress stage as intermediate", () => {
		expect(
			isFixedImportStage({ isEntry: false, kind: ImportStageKind.IN_PROGRESS }),
		).toBe(false);
	});
});

describe("closed import kinds", () => {
	it("closes received and cancelled only", () => {
		expect(isClosedImportKind(ImportStageKind.IN_PROGRESS)).toBe(false);
		expect(isClosedImportKind(ImportStageKind.RECEIVED)).toBe(true);
		expect(isClosedImportKind(ImportStageKind.CANCELLED)).toBe(true);
	});
});

describe("IMPORT_STAGE", () => {
	it("keeps the intermediate positions below the fixed end", () => {
		expect(IMPORT_STAGE.firstIntermediatePosition).toBeLessThan(
			IMPORT_STAGE.fixedEndPosition,
		);
		expect(IMPORT_STAGE.nameMaxLength).toBeGreaterThan(0);
	});
});
