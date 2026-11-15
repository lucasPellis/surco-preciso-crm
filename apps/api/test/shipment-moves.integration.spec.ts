import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { ImportStageKind } from "@crm/db/enums";
import { IMPORT_STAGE } from "@crm/db/import-stage";
import {
	BadRequestException,
	ConflictException,
	NotFoundException,
} from "@nestjs/common";
import { taskDueDay } from "../src/activities/task-due-date";
import {
	moveShipmentInTx,
	type ShipmentMoveInput,
} from "../src/imports/shipment-moves";
import { removeTestProcesses } from "./import-process-fixture";

const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
const actorId = `sm-actor-${suffix}`;
const prefix = `SM${suffix}`;
const NOW = new Date("2026-03-01T15:00:00.000Z");
const START_DAY = "2026-01-10";

const stageKeys = {
	entry: `SM_ENTRY_${suffix}`,
	first: `SM_FIRST_${suffix}`,
	second: `SM_SECOND_${suffix}`,
	archived: `SM_ARCHIVED_${suffix}`,
	received: `SM_RECEIVED_${suffix}`,
	foreign: `SM_FOREIGN_${suffix}`,
};
const entryKey = stageKeys.entry;
const receivedKey = stageKeys.received;
const processIds: string[] = [];

let orderId: string;

function move(input: Omit<ShipmentMoveInput, "actorId">) {
	return db.$transaction((tx) =>
		moveShipmentInTx(tx, { ...input, actorId }, NOW),
	);
}

async function shipmentIn(stageKey: string): Promise<string> {
	const shipment = await db.shipment.create({
		data: {
			orderId,
			stageKey,
			stageChangedAt: taskDueDay(START_DAY),
			events: {
				create: { stageKey, occurredAt: taskDueDay(START_DAY), actorId },
			},
		},
		select: { id: true },
	});
	return shipment.id;
}

async function eventsOf(shipmentId: string) {
	return db.shipmentStageEvent.findMany({
		where: { shipmentId },
		orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
		select: { stageKey: true, occurredAt: true, actorId: true },
	});
}

async function stageOf(shipmentId: string) {
	return db.shipment.findUniqueOrThrow({
		where: { id: shipmentId },
		select: { stageKey: true, stageChangedAt: true },
	});
}

beforeAll(async () => {
	await db.user.create({
		data: {
			id: actorId,
			name: "Shipment Actor",
			email: `${actorId}@example.test`,
		},
	});
	const own = await db.importProcess.create({
		data: {
			name: `Movimientos ${suffix}`,
			stages: {
				create: [
					{
						key: stageKeys.entry,
						name: `Entrada ${suffix}`,
						kind: ImportStageKind.IN_PROGRESS,
						isEntry: true,
						position: IMPORT_STAGE.entryPosition,
					},
					{
						key: stageKeys.first,
						name: `Primera ${suffix}`,
						kind: ImportStageKind.IN_PROGRESS,
						position: 1,
					},
					{
						key: stageKeys.second,
						name: `Segunda ${suffix}`,
						kind: ImportStageKind.IN_PROGRESS,
						position: 2,
					},
					{
						key: stageKeys.archived,
						name: `Archivada ${suffix}`,
						kind: ImportStageKind.IN_PROGRESS,
						position: 3,
						archivedAt: new Date(),
					},
					{
						key: stageKeys.received,
						name: `Recibida ${suffix}`,
						kind: ImportStageKind.RECEIVED,
						position: IMPORT_STAGE.fixedEndPosition,
					},
				],
			},
		},
		select: { id: true },
	});
	const foreign = await db.importProcess.create({
		data: {
			name: `Movimientos ajenos ${suffix}`,
			stages: {
				create: {
					key: stageKeys.foreign,
					name: `Ajena ${suffix}`,
					kind: ImportStageKind.IN_PROGRESS,
					position: 1,
				},
			},
		},
		select: { id: true },
	});
	processIds.push(own.id, foreign.id);
	const order = await db.purchaseOrder.create({
		data: {
			number: `${prefix}-1`,
			supplierName: "Proveedor de prueba",
			orderedAt: taskDueDay(START_DAY),
			processId: own.id,
		},
		select: { id: true },
	});
	orderId = order.id;
});

afterAll(async () => {
	await removeTestProcesses(processIds);
	await db.user.deleteMany({ where: { id: actorId } });
});

describe("moving a shipment", () => {
	it("writes an event and moves the shipment on that day", async () => {
		const id = await shipmentIn(entryKey);

		const moved = await move({
			shipmentId: id,
			targetKey: stageKeys.first,
			occurredOn: "2026-02-01",
		});

		expect(moved.from.key).toBe(entryKey);
		expect(moved.to).toEqual({
			key: stageKeys.first,
			kind: ImportStageKind.IN_PROGRESS,
		});
		expect(moved.occurredAt).toEqual(taskDueDay("2026-02-01"));
		const shipment = await stageOf(id);
		expect(shipment.stageKey).toBe(stageKeys.first);
		expect(shipment.stageChangedAt).toEqual(taskDueDay("2026-02-01"));
		const events = await eventsOf(id);
		expect(events.map((event) => event.stageKey)).toEqual([
			entryKey,
			stageKeys.first,
		]);
		expect(events[1]?.actorId).toBe(actorId);
	});

	it("accepts the same day as the previous event and today", async () => {
		const id = await shipmentIn(entryKey);

		await move({
			shipmentId: id,
			targetKey: stageKeys.first,
			occurredOn: START_DAY,
		});
		await move({
			shipmentId: id,
			targetKey: stageKeys.second,
			occurredOn: "2026-03-01",
		});

		expect((await eventsOf(id)).length).toBe(3);
		expect((await stageOf(id)).stageKey).toBe(stageKeys.second);
	});

	it("refuses a day before the previous event and writes nothing", async () => {
		const id = await shipmentIn(entryKey);

		await expect(
			move({
				shipmentId: id,
				targetKey: stageKeys.first,
				occurredOn: "2026-01-09",
			}),
		).rejects.toBeInstanceOf(BadRequestException);

		expect((await eventsOf(id)).length).toBe(1);
		expect((await stageOf(id)).stageKey).toBe(entryKey);
	});

	it("refuses a day after today", async () => {
		const id = await shipmentIn(entryKey);

		await expect(
			move({
				shipmentId: id,
				targetKey: stageKeys.first,
				occurredOn: "2026-03-02",
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("refuses the stage the shipment is already in", async () => {
		const id = await shipmentIn(stageKeys.first);

		await expect(
			move({
				shipmentId: id,
				targetKey: stageKeys.first,
				occurredOn: "2026-02-01",
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("refuses an archived or missing target", async () => {
		const id = await shipmentIn(entryKey);

		await expect(
			move({
				shipmentId: id,
				targetKey: stageKeys.archived,
				occurredOn: "2026-02-01",
			}),
		).rejects.toBeInstanceOf(BadRequestException);
		await expect(
			move({
				shipmentId: id,
				targetKey: `NO_SUCH_STAGE_${suffix}`,
				occurredOn: "2026-02-01",
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("refuses a stage of another process and writes nothing", async () => {
		const id = await shipmentIn(entryKey);

		await expect(
			move({
				shipmentId: id,
				targetKey: stageKeys.foreign,
				occurredOn: "2026-02-01",
			}),
		).rejects.toBeInstanceOf(BadRequestException);

		expect((await eventsOf(id)).length).toBe(1);
		expect((await stageOf(id)).stageKey).toBe(entryKey);
	});

	it("refuses every move once the shipment is received", async () => {
		const id = await shipmentIn(entryKey);
		await move({
			shipmentId: id,
			targetKey: receivedKey,
			occurredOn: "2026-02-01",
		});

		await expect(
			move({
				shipmentId: id,
				targetKey: stageKeys.first,
				occurredOn: "2026-02-02",
			}),
		).rejects.toBeInstanceOf(ConflictException);
		expect((await stageOf(id)).stageKey).toBe(receivedKey);
	});

	it("reports a missing shipment as not found", async () => {
		await expect(
			move({
				shipmentId: `no-such-shipment-${suffix}`,
				targetKey: stageKeys.first,
				occurredOn: "2026-02-01",
			}),
		).rejects.toBeInstanceOf(NotFoundException);
	});
});
