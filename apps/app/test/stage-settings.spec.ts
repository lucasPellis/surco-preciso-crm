import { describe, expect, it } from "bun:test";
import {
	PIPELINE_STAGE,
	stageKey,
	uniqueStageKey,
} from "@crm/db/pipeline-stage";
import {
	applyOrder,
	archiveTargets,
	idleHoursOf,
	type StageSettingsRow,
	splitStages,
} from "../lib/stage-settings";

function row(
	key: string,
	kind: StageSettingsRow["kind"],
	position: number,
	extra: Partial<StageSettingsRow> = {},
): StageSettingsRow {
	return {
		key,
		name: key,
		kind,
		tone: "NEUTRAL",
		position,
		isEntry: false,
		idleAfterHours: null,
		archived: false,
		dealCount: 0,
		...extra,
	};
}

const rows = [
	row("LOST", "LOST", 1001),
	row("WON", "WON", 1000),
	row("B", "OPEN", 2),
	row("NEW", "OPEN", 0, { isEntry: true }),
	row("A", "OPEN", 1),
	row("WAIT", "PAUSED", 3),
	row("OLD", "OPEN", 4, { archived: true }),
];

describe("splitting the stages", () => {
	it("separates fixed rows, intermediate rows and the archive", () => {
		const split = splitStages(rows);

		expect(split.entry?.key).toBe("NEW");
		expect(split.won?.key).toBe("WON");
		expect(split.lost?.key).toBe("LOST");
		expect(split.intermediate.map((stage) => stage.key)).toEqual([
			"A",
			"B",
			"WAIT",
		]);
		expect(split.archived.map((stage) => stage.key)).toEqual(["OLD"]);
	});
});

describe("ordering", () => {
	it("reuses the intermediate slots and leaves fixed rows alone", () => {
		const next = applyOrder(rows, ["WAIT", "A", "B"]);
		const split = splitStages(next);

		expect(split.intermediate.map((stage) => stage.key)).toEqual([
			"WAIT",
			"A",
			"B",
		]);
		expect(split.entry?.position).toBe(0);
		expect(split.won?.position).toBe(1000);
		expect(split.lost?.position).toBe(1001);
	});
});

describe("archive targets", () => {
	it("offers active open or paused stages except the stage itself", () => {
		expect(archiveTargets(rows, "A").map((stage) => stage.key)).toEqual([
			"NEW",
			"B",
			"WAIT",
		]);
	});
});

describe("idle hours input", () => {
	it("reads empty as none and refuses anything that is not a positive integer", () => {
		expect(idleHoursOf("  ")).toBeNull();
		expect(idleHoursOf("48")).toBe(48);
		for (const bad of ["0", "-3", "1.5", "abc", "1e3"]) {
			expect(idleHoursOf(bad)).toBeUndefined();
		}
	});
});

describe("keys", () => {
	it("builds a key from the name without accents or symbols", () => {
		expect(stageKey("Visita técnica")).toBe("VISITA_TECNICA");
		expect(stageKey("  ¿Esperando pago? ")).toBe("ESPERANDO_PAGO");
		expect(stageKey("!!!")).toBe("");
	});

	it("never reuses a taken key", () => {
		expect(uniqueStageKey("Visita", new Set(["VISITA", "VISITA_2"]))).toBe(
			"VISITA_3",
		);
		expect(PIPELINE_STAGE.nameMaxLength).toBe(40);
	});
});
