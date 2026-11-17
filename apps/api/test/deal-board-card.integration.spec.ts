import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { ActivityType, db } from "@crm/db";
import { taskDayBoundaries } from "../src/activities/task-due-date";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversionService } from "../src/currency/conversion.service";
import { dealBoardOutput } from "../src/deals/deals.contracts";
import { DealsService } from "../src/deals/deals.service";
import { FieldsService } from "../src/fields/fields.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";
import { expectOutput } from "./expect-output";

const suffix = process.env.TEST_RUN_ID ?? "deal-board-card-spec";
const ownerId = `dbc-owner-${suffix}`;
const otherId = `dbc-other-${suffix}`;
const phone = `+54911${suffix.replace(/\D/g, "").padEnd(7, "7").slice(0, 7)}`;

const agent = {
	withCrmEvents: withDiscardedCrmEvents,
	fieldBackfillRecords: async () => ({ queued: 0, merged: 0 }),
} as unknown as AgentTriggerService;

const deals = new DealsService(
	db,
	agent,
	new ActivityStampService(db),
	new ConversionService(db),
	new FieldsService(db, { fieldBackfill: async () => undefined } as never),
);

const DAY_MS = 86_400_000;
const { startOfToday } = taskDayBoundaries(new Date());
const day = (offset: number) =>
	new Date(startOfToday.getTime() + offset * DAY_MS);

const companyIds: string[] = [];
const dealIds = new Map<string, string>();

async function board(scope: "me" | "everyone" = "me", user = ownerId) {
	const result = expectOutput(
		dealBoardOutput,
		await deals.board({ scope }, user),
	);
	const cards = result.columns.flatMap((column) => column.cards);
	return (name: string) => cards.find((card) => card.name === name);
}

async function company(name: string) {
	const created = await db.company.create({
		data: { name: `${name} ${suffix}` },
		select: { id: true },
	});
	companyIds.push(created.id);
	return created.id;
}

async function deal(name: string, companyId: string, owner = ownerId) {
	const created = await db.deal.create({
		data: { name, companyId, ownerId: owner, stage: "CONTACTED" },
		select: { id: true },
	});
	dealIds.set(name, created.id);
	return created.id;
}

async function task(
	dealId: string,
	companyId: string,
	subject: string,
	dueAt: Date | null,
	completedAt: Date | null = null,
) {
	await db.activity.create({
		data: {
			type: ActivityType.TASK,
			subject,
			dueAt,
			completedAt,
			companyId,
			dealId,
			createdById: ownerId,
		},
	});
}

beforeAll(async () => {
	await db.user.createMany({
		data: [
			{ id: ownerId, name: "Card Owner", email: `${ownerId}@example.test` },
			{ id: otherId, name: "Card Other", email: `${otherId}@example.test` },
		],
	});

	const withPhone = await company("Con telefono");
	const contact = await db.contact.create({
		data: { firstName: "Ana", companyId: withPhone, phone },
		select: { id: true },
	});
	await db.company.update({
		where: { id: withPhone },
		data: { primaryContactId: contact.id },
	});
	await deal("Con telefono", withPhone);

	const noPrimary = await company("Sin principal");
	await db.contact.create({
		data: { firstName: "Beto", companyId: noPrimary, phone: `${phone}1` },
	});
	await deal("Sin principal", noPrimary);

	const noPhone = await company("Sin telefono");
	const quiet = await db.contact.create({
		data: { firstName: "Carla", companyId: noPhone },
		select: { id: true },
	});
	await db.company.update({
		where: { id: noPhone },
		data: { primaryContactId: quiet.id },
	});
	await deal("Sin telefono", noPhone);

	async function linked(
		name: string,
		companyId: string,
		people: Array<{ phone: string | null; createdAt: Date }>,
		primary = false,
	) {
		const dealId = await deal(name, companyId);
		const ids: string[] = [];
		for (const [index, person] of people.entries()) {
			const created = await db.contact.create({
				data: {
					firstName: `${name} ${index}`,
					companyId,
					phone: person.phone,
					createdAt: person.createdAt,
				},
				select: { id: true },
			});
			ids.push(created.id);
			await db.dealContact.create({
				data: { dealId, contactId: created.id },
			});
		}
		if (primary && ids[0]) {
			await db.company.update({
				where: { id: companyId },
				data: { primaryContactId: ids[0] },
			});
		}
	}
	const long = new Date("2026-01-01T00:00:00Z");
	const recent = new Date("2026-06-01T00:00:00Z");

	const fallback = await company("Fallback");
	await linked("Fallback uno", fallback, [
		{ phone: `${phone}2`, createdAt: long },
	]);
	const two = await company("Dos contactos");
	await linked("Fallback dos", two, [
		{ phone: null, createdAt: long },
		{ phone: `${phone}4`, createdAt: recent },
		{ phone: `${phone}3`, createdAt: new Date("2026-03-01T00:00:00Z") },
	]);
	const bare = await company("Nadie");
	await linked("Fallback ninguno", bare, [{ phone: null, createdAt: long }]);
	const quietPrimary = await company("Principal mudo");
	await linked(
		"Fallback principal",
		quietPrimary,
		[
			{ phone: null, createdAt: long },
			{ phone: `${phone}5`, createdAt: recent },
		],
		true,
	);

	const tasks = await company("Tareas");
	const today = await deal("Tarea hoy", tasks);
	await task(today, tasks, "Llamar hoy", day(0));
	await task(today, tasks, "Llamar mañana", day(1));
	const overdue = await deal("Tarea vencida", tasks);
	await task(overdue, tasks, "Llamar ayer", day(-1));
	await task(overdue, tasks, "Llamar hace tres días", day(-3));
	await task(overdue, tasks, "Llamar hoy", day(0));
	const future = await deal("Tarea futura", tasks);
	await task(future, tasks, "Llamar el mes que viene", day(30));
	await task(future, tasks, "Sin fecha", null);
	const done = await deal("Tarea hecha", tasks);
	await task(done, tasks, "Ya llamé", day(-2), new Date());
	await deal("Sin tareas", tasks);

	const foreign = await company("Ajena");
	const foreignDeal = await deal("Tarea ajena", foreign, otherId);
	await task(foreignDeal, foreign, "Llamar ajena", day(0));
});

afterAll(async () => {
	if (companyIds.length > 0) {
		await db.deal.deleteMany({ where: { companyId: { in: companyIds } } });
		await db.activity.deleteMany({ where: { companyId: { in: companyIds } } });
		await db.company.updateMany({
			where: { id: { in: companyIds } },
			data: { primaryContactId: null },
		});
		await db.contact.deleteMany({ where: { companyId: { in: companyIds } } });
		await db.company.deleteMany({ where: { id: { in: companyIds } } });
	}
	await db.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } });
});

describe("the phone on a funnel card", () => {
	it("is the primary contact's phone", async () => {
		expect((await board())("Con telefono")?.phone).toBe(phone);
	});

	it("is absent when the company has no primary contact", async () => {
		expect((await board())("Sin principal")?.phone).toBeNull();
	});

	it("is absent when the primary contact has no phone", async () => {
		expect((await board())("Sin telefono")?.phone).toBeNull();
	});
});

describe("the phone fallback on a funnel card", () => {
	it("uses the phone of a contact on the deal when there is no primary", async () => {
		expect((await board())("Fallback uno")?.phone).toBe(`${phone}2`);
	});

	it("uses the earliest created contact on the deal that has a phone", async () => {
		expect((await board())("Fallback dos")?.phone).toBe(`${phone}3`);
	});

	it("is absent when no contact has a phone", async () => {
		expect((await board())("Fallback ninguno")?.phone).toBeNull();
	});

	it("falls back to the deal when the primary contact has no phone", async () => {
		expect((await board())("Fallback principal")?.phone).toBe(`${phone}5`);
	});
});

describe("the task on a funnel card", () => {
	it("shows a task due today", async () => {
		expect((await board())("Tarea hoy")?.task).toEqual({
			title: "Llamar hoy",
			dueAt: startOfToday.toISOString().slice(0, 10),
			overdue: false,
		});
	});

	it("shows the earliest overdue task and marks it overdue", async () => {
		const task = (await board())("Tarea vencida")?.task;

		expect(task?.title).toBe("Llamar hace tres días");
		expect(task?.overdue).toBe(true);
	});

	it("leaves out a future task and a task with no date", async () => {
		expect((await board())("Tarea futura")?.task).toBeNull();
	});

	it("leaves out a done task", async () => {
		expect((await board())("Tarea hecha")?.task).toBeNull();
	});

	it("shows nothing for a deal with no tasks", async () => {
		expect((await board())("Sin tareas")?.task).toBeNull();
	});

	it("respects the scope of the board", async () => {
		expect((await board("me"))("Tarea ajena")).toBeUndefined();
		expect((await board("everyone"))("Tarea ajena")?.task?.title).toBe(
			"Llamar ajena",
		);
	});
});
