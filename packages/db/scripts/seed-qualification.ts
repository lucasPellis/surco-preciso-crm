import { db } from "../src/client";
import { fieldKeyFromLabel } from "../src/fields-shape";
import { QUALIFICATION } from "../src/qualification";

for (const [position, question] of QUALIFICATION.questions.entries()) {
	const key = fieldKeyFromLabel(question.label);
	const existing = await db.fieldDefinition.findUnique({
		where: { entity_key: { entity: "DEAL", key } },
		select: { id: true, options: { select: { label: true, position: true } } },
	});
	if (existing) {
		console.log(`exists  ${question.label}`);
		let next = existing.options.reduce(
			(max, option) => Math.max(max, option.position + 1),
			0,
		);
		const known = new Set(existing.options.map((option) => option.label));
		for (const label of question.options) {
			if (known.has(label)) continue;
			await db.fieldOption.create({
				data: { fieldId: existing.id, label, position: next },
			});
			next += 1;
			console.log(`added option ${label}`);
		}
		continue;
	}
	await db.fieldDefinition.create({
		data: {
			entity: "DEAL",
			key,
			label: question.label,
			type: question.type,
			showOnTable: false,
			showOnFilter: false,
			agentFilled: false,
			position,
			options: {
				create: question.options.map((label, index) => ({
					label,
					position: index,
				})),
			},
		},
	});
	console.log(`created ${question.label}`);
}

await db.$disconnect();
