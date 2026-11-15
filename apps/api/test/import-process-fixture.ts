import { db } from "@crm/db";
import { ImportStageKind } from "@crm/db/enums";
import { IMPORT_PROCESS, keyedStages } from "@crm/db/import-process";

export type TestProcess = {
	id: string;
	name: string;
	entryKey: string;
	receivedKey: string;
	cancelledKey: string;
};

type StageRef = { key: string; kind: ImportStageKind; isEntry: boolean };

function keyOf(
	stages: readonly StageRef[],
	match: (stage: StageRef) => boolean,
): string {
	const found = stages.find(match);
	if (!found) throw new Error("The test process has no such stage.");
	return found.key;
}

export async function createTestProcess(name: string): Promise<TestProcess> {
	const taken = await db.importStage.findMany({ select: { key: true } });
	const created = await db.importProcess.create({
		data: {
			name,
			stages: {
				create: keyedStages(
					IMPORT_PROCESS.fixedStages,
					new Set(taken.map((row) => row.key)),
				),
			},
		},
		select: {
			id: true,
			stages: { select: { key: true, kind: true, isEntry: true } },
		},
	});

	return {
		id: created.id,
		name,
		entryKey: keyOf(created.stages, (stage) => stage.isEntry),
		receivedKey: keyOf(
			created.stages,
			(stage) => stage.kind === ImportStageKind.RECEIVED,
		),
		cancelledKey: keyOf(
			created.stages,
			(stage) => stage.kind === ImportStageKind.CANCELLED,
		),
	};
}

export async function removeTestProcesses(
	ids: readonly string[],
): Promise<void> {
	const processIds = [...ids];
	await db.shipment.deleteMany({
		where: { order: { processId: { in: processIds } } },
	});
	await db.purchaseOrder.deleteMany({
		where: { processId: { in: processIds } },
	});
	await db.importStage.deleteMany({
		where: { processId: { in: processIds } },
	});
	await db.importProcess.deleteMany({ where: { id: { in: processIds } } });
}
