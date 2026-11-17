import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { QUALIFICATION, QUALIFICATION_KEYS } from "@crm/db/qualification";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversionService } from "../src/currency/conversion.service";
import { dealBoardOutput } from "../src/deals/deals.contracts";
import { DealsService } from "../src/deals/deals.service";
import { FieldsService } from "../src/fields/fields.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";
import { expectOutput } from "./expect-output";

const suffix = crypto.randomUUID().slice(0, 8);
const ownerId = `qual-owner-${suffix}`;

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

let companyId: string;
let answeredTwo: string;
let answeredNone: string;
const createdFieldIds: string[] = [];
let hadQualificationFields = false;

async function cards() {
	const result = expectOutput(
		dealBoardOutput,
		await deals.board({ scope: "me" }, ownerId),
	);
	const all = result.columns.flatMap((column) => column.cards);
	return (id: string) => all.find((card) => card.id === id);
}

beforeAll(async () => {
	await db.user.create({
		data: { id: ownerId, name: "Qual Owner", email: `${ownerId}@example.test` },
	});
	companyId = (
		await db.company.create({
			data: { name: `Qual company ${suffix}` },
			select: { id: true },
		})
	).id;
	answeredTwo = (
		await db.deal.create({
			data: { name: "Dos respuestas", companyId, ownerId, stage: "CONTACTED" },
			select: { id: true },
		})
	).id;
	answeredNone = (
		await db.deal.create({
			data: { name: "Sin respuestas", companyId, ownerId, stage: "CONTACTED" },
			select: { id: true },
		})
	).id;
	hadQualificationFields =
		(await db.fieldDefinition.count({
			where: { entity: "DEAL", key: { in: [...QUALIFICATION_KEYS] } },
		})) > 0;
});

afterAll(async () => {
	await db.deal.deleteMany({ where: { companyId } });
	await db.company.deleteMany({ where: { id: companyId } });
	await db.fieldDefinition.deleteMany({
		where: { id: { in: createdFieldIds } },
	});
	await db.user.deleteMany({ where: { id: ownerId } });
});

describe("the qualification counter on the board", () => {
	it("is null while the deal has no qualification questions defined", async () => {
		if (hadQualificationFields) return;

		const card = (await cards())(answeredTwo);

		expect(card?.qualification).toBeNull();
	});

	it("counts the answered questions of each card", async () => {
		const created = await Promise.all(
			QUALIFICATION.questions.map((question, index) =>
				db.fieldDefinition.upsert({
					where: {
						entity_key: {
							entity: "DEAL",
							key: QUALIFICATION_KEYS[index] ?? "",
						},
					},
					create: {
						entity: "DEAL",
						key: QUALIFICATION_KEYS[index] ?? "",
						label: question.label,
						type: question.type,
						agentFilled: false,
						position: index,
					},
					update: {},
				}),
			),
		);
		if (!hadQualificationFields) {
			createdFieldIds.push(...created.map((field) => field.id));
		}
		const [text, , , date] = created;
		const unrelated = await db.fieldDefinition.create({
			data: {
				entity: "DEAL",
				key: `otro_${suffix}`,
				label: "Otro",
				type: "TEXT",
				position: 99,
			},
		});
		createdFieldIds.push(unrelated.id);

		await db.fieldValue.createMany({
			data: [
				{ fieldId: text?.id ?? "", dealId: answeredTwo, text: "Un tractor" },
				{ fieldId: date?.id ?? "", dealId: answeredTwo, date: new Date() },
				{ fieldId: unrelated.id, dealId: answeredNone, text: "No cuenta" },
			],
		});

		const card = await cards();

		expect(card(answeredTwo)?.qualification).toEqual({
			answered: 2,
			total: created.length,
		});
		expect(card(answeredNone)?.qualification).toEqual({
			answered: 0,
			total: created.length,
		});
	});

	it("does not count an archived question", async () => {
		const first = await db.fieldDefinition.findFirstOrThrow({
			where: { entity: "DEAL", key: QUALIFICATION_KEYS[0] ?? "" },
		});
		await db.fieldDefinition.update({
			where: { id: first.id },
			data: { archivedAt: new Date() },
		});

		try {
			const card = (await cards())(answeredTwo);
			expect(card?.qualification?.answered).toBe(1);
			expect(card?.qualification?.total).toBe(
				QUALIFICATION.questions.length - 1,
			);
		} finally {
			await db.fieldDefinition.update({
				where: { id: first.id },
				data: { archivedAt: null },
			});
		}
	});
});
