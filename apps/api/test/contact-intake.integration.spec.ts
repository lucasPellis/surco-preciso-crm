import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { AgentQueueService } from "../src/agent/agent-queue.service";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import {
	type ContactCreateInput,
	contactListInput,
} from "../src/contacts/contacts.contracts";
import { ContactsService } from "../src/contacts/contacts.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { FieldsService } from "../src/fields/fields.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? "contact-intake-spec";
const base = 5_400_000_000 + Math.floor(Math.random() * 900_000_000);

let companyAgentCalls = 0;

const agent = {
	contactCreated: async () => true,
	companyCreated: async () => {
		companyAgentCalls += 1;
	},
	companyRequested: async () => true,
	withCrmEvents: withDiscardedCrmEvents,
	fieldBackfillRecords: async (_: unknown, __: unknown, ids: string[]) => ({
		queued: ids.length,
		merged: 0,
	}),
} as unknown as AgentTriggerService;

const contacts = new ContactsService(
	db,
	new CompanyDirectoryService(agent),
	agent,
	new AgentQueueService(db),
	new ActivityStampService(db),
	new FieldsService(db, agent),
);

const contactIds: string[] = [];
const companyIds: string[] = [];
const sourceIds: string[] = [];

function phone(offset: number): string {
	return `+${base + offset}`;
}

const actorId = `intake-actor-${suffix}`;

async function file(input: ContactCreateInput, actor?: string) {
	const created = await contacts.create(input, actor);
	contactIds.push(created.id);
	const row = await db.contact.findUniqueOrThrow({
		where: { id: created.id },
		select: { id: true, companyId: true, leadSourceId: true, phone: true },
	});
	if (row.companyId) companyIds.push(row.companyId);
	return row;
}

async function companyOf(id: string | null) {
	return db.company.findUniqueOrThrow({
		where: { id: id ?? "" },
		select: { name: true, domain: true, enrichmentStatus: true },
	});
}

beforeAll(async () => {
	await db.user.create({
		data: {
			id: actorId,
			name: "Intake Actor",
			email: `${actorId}@example.test`,
		},
	});
});

afterAll(async () => {
	await db.contact.deleteMany({ where: { id: { in: contactIds } } });
	await db.deal.deleteMany({ where: { ownerId: actorId } });
	await db.company.deleteMany({ where: { id: { in: companyIds } } });
	await db.user.deleteMany({ where: { id: actorId } });
	await db.leadSource.deleteMany({ where: { id: { in: sourceIds } } });
});

describe("a new contact always has a company", () => {
	it("names a company after a person with a free-mail address", async () => {
		const before = companyAgentCalls;
		const row = await file({
			firstName: "Juan",
			lastName: "Pérez",
			email: `juan-${suffix}@gmail.com`,
			phone: phone(1),
		});

		const company = await companyOf(row.companyId);
		expect(company.name).toBe("Juan Pérez");
		expect(company.domain).toBeNull();
		expect(company.enrichmentStatus).toBe("SKIPPED");
		expect(companyAgentCalls).toBe(before);
	});

	it("names a company after a person who gave only a phone", async () => {
		const row = await file({ firstName: "Ana", phone: phone(2) });

		expect((await companyOf(row.companyId)).name).toBe("Ana");
	});

	it("files a lead under the one company that owns the number", async () => {
		const owner = await db.company.create({
			data: { name: `Agro ${suffix}`, phone: phone(3) },
			select: { id: true },
		});
		companyIds.push(owner.id);

		const row = await file({ firstName: "Luis", phone: phone(3) });

		expect(row.companyId).toBe(owner.id);
	});

	it("does not guess when two companies share the number", async () => {
		const twins = await Promise.all(
			["A", "B"].map((tag) =>
				db.company.create({
					data: { name: `Twin ${tag} ${suffix}`, phone: phone(4) },
					select: { id: true },
				}),
			),
		);
		companyIds.push(...twins.map((twin) => twin.id));

		const row = await file({ firstName: "Eva", phone: phone(4) });

		expect(twins.map((twin) => twin.id)).not.toContain(row.companyId);
		expect((await companyOf(row.companyId)).name).toBe("Eva");
	});
});

describe("a phone number belongs to one contact", () => {
	it("refuses the same number written another way", async () => {
		const digits = String(base + 7);
		await file({
			firstName: "Mario",
			phone: `+${digits.slice(0, 2)} ${digits.slice(2, 5)}-${digits.slice(5)}`,
		});

		await expect(
			contacts.create({ firstName: "Otro", phone: `+${digits}` }),
		).rejects.toBeInstanceOf(ConflictException);
	});

	it("refuses an update to a number another contact uses", async () => {
		const first = await file({ firstName: "Rosa", phone: phone(10) });
		const second = await file({ firstName: "Pablo", phone: phone(11) });

		await expect(
			contacts.update(second.id, { phone: first.phone ?? "" }),
		).rejects.toBeInstanceOf(ConflictException);
	});

	it("lets a contact keep its own number on update", async () => {
		const row = await file({ firstName: "Nora", phone: phone(12) });

		const updated = await contacts.update(row.id, {
			phone: phone(12),
			title: "Dueña",
		});

		expect(updated.id).toBe(row.id);
	});
});

describe("a contact has a lead source", () => {
	it("stores an active source", async () => {
		const source = await db.leadSource.create({
			data: { key: `intake-${suffix}-on`, name: `On ${suffix}` },
			select: { id: true },
		});
		sourceIds.push(source.id);

		const row = await file({
			firstName: "Tomas",
			phone: phone(20),
			leadSourceId: source.id,
		});

		expect(row.leadSourceId).toBe(source.id);
	});

	it("lists the source, filters by it and counts it", async () => {
		const source = await db.leadSource.create({
			data: {
				key: `intake-${suffix}-list`,
				name: `List ${suffix}`,
				icon: "web",
			},
			select: { id: true },
		});
		sourceIds.push(source.id);
		const withSource = await file({
			firstName: "Lucia",
			phone: phone(30),
			leadSourceId: source.id,
			originDetail: "Expo Rural",
		});
		await file({ firstName: "Mateo", phone: phone(31) });

		const result = await contacts.list(
			contactListInput.parse({ leadSource: [source.id] }),
		);

		expect(result.rows.map((row) => row.id)).toEqual([withSource.id]);
		expect(result.rows[0]?.leadSource).toEqual({
			id: source.id,
			name: `List ${suffix}`,
			icon: "web",
		});
		expect(result.rows[0]?.originDetail).toBe("Expo Rural");

		const all = await contacts.list(contactListInput.parse({}));
		expect(all.facetCounts.leadSource?.[source.id]).toBe(1);
		expect(all.facetCounts.leadSource?.none).toBeGreaterThanOrEqual(1);

		const unknown = await contacts.list(
			contactListInput.parse({ leadSource: ["none"] }),
		);
		expect(unknown.rows.every((row) => row.leadSource === null)).toBe(true);
	});

	it("opens a deal in Nuevo with the same source", async () => {
		const source = await db.leadSource.create({
			data: { key: `intake-${suffix}-deal`, name: `Deal ${suffix}` },
			select: { id: true },
		});
		sourceIds.push(source.id);

		const row = await file(
			{
				firstName: "Julia",
				lastName: "Ferreyra",
				phone: phone(40),
				leadSourceId: source.id,
			},
			actorId,
		);

		const deals = await db.deal.findMany({
			where: { companyId: row.companyId ?? "" },
			select: {
				name: true,
				stage: true,
				ownerId: true,
				leadSourceId: true,
				contacts: { select: { contactId: true } },
			},
		});

		const contact = await db.contact.findUniqueOrThrow({
			where: { id: row.id },
			select: { ownerId: true },
		});
		expect(contact.ownerId).toBe(actorId);

		const task = await db.activity.findFirstOrThrow({
			where: { contactId: row.id, type: "TASK" },
			select: {
				subject: true,
				createdById: true,
				completedAt: true,
				dueAt: true,
			},
		});
		expect(task.subject).toBe("Contactar al lead");
		expect(task.createdById).toBe(actorId);
		expect(task.completedAt).toBeNull();
		expect(task.dueAt).not.toBeNull();

		expect(deals).toEqual([
			{
				name: "Julia Ferreyra",
				stage: "NEW",
				ownerId: actorId,
				leadSourceId: source.id,
				contacts: [{ contactId: row.id }],
			},
		]);
	});

	it("opens no deal when nobody owns the contact", async () => {
		const row = await file({ firstName: "Nadie", phone: phone(41) });

		expect(
			await db.deal.count({ where: { companyId: row.companyId ?? "" } }),
		).toBe(0);
	});

	it("refuses an archived source", async () => {
		const source = await db.leadSource.create({
			data: {
				key: `intake-${suffix}-off`,
				name: `Off ${suffix}`,
				archivedAt: new Date(),
			},
			select: { id: true },
		});
		sourceIds.push(source.id);

		await expect(
			contacts.create({
				firstName: "Sofia",
				phone: phone(21),
				leadSourceId: source.id,
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});
});
