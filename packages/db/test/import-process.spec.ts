import { describe, expect, it } from "bun:test";
import {
	ImportStageKind,
	PipelineStageTone,
} from "../src/generated/prisma/enums";
import { IMPORT_PROCESS, keyedStages } from "../src/import-process";
import { IMPORT_STAGE } from "../src/import-stage";

const template = (name: string, position: number) => ({
	name,
	kind: ImportStageKind.IN_PROGRESS,
	tone: PipelineStageTone.INFO,
	position,
	isEntry: false,
});

describe("the fixed stages of a new process", () => {
	it("are the entry, received and cancelled stages at their positions", () => {
		expect(
			IMPORT_PROCESS.fixedStages.map((stage) => [
				stage.name,
				stage.kind,
				stage.position,
				stage.isEntry,
			]),
		).toEqual([
			["Pedido", ImportStageKind.IN_PROGRESS, IMPORT_STAGE.entryPosition, true],
			[
				"Recibido",
				ImportStageKind.RECEIVED,
				IMPORT_STAGE.fixedEndPosition,
				false,
			],
			[
				"Cancelado",
				ImportStageKind.CANCELLED,
				IMPORT_STAGE.cancelledPosition,
				false,
			],
		]);
	});
});

describe("keyed stages", () => {
	it("derives each key from the name", () => {
		expect(
			keyedStages(IMPORT_PROCESS.fixedStages, new Set()).map(
				(stage) => stage.key,
			),
		).toEqual(["PEDIDO", "RECIBIDO", "CANCELADO"]);
	});

	it("never reuses a taken key", () => {
		const [stage] = keyedStages(
			[template("Pedido", 0)],
			new Set(["PEDIDO", "PEDIDO_2"]),
		);

		expect(stage?.key).toBe("PEDIDO_3");
	});

	it("keeps two equal names of one batch apart", () => {
		expect(
			keyedStages(
				[template("Aduana", 1), template("Aduana", 2)],
				new Set(),
			).map((stage) => stage.key),
		).toEqual(["ADUANA", "ADUANA_2"]);
	});

	it("falls back to a fixed name when the name has no letter or digit", () => {
		const [stage] = keyedStages([template("!!!", 1)], new Set(["ETAPA"]));

		expect(stage?.key).toBe("ETAPA_2");
	});

	it("keeps every other field and the order", () => {
		const [first, second] = keyedStages(
			[template("Con DHL", 2), template("Costos", 3)],
			new Set(),
		);

		expect(first).toEqual({ ...template("Con DHL", 2), key: "CON_DHL" });
		expect(second).toEqual({ ...template("Costos", 3), key: "COSTOS" });
	});
});
