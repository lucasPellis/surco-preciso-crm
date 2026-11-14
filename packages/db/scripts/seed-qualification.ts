import { db } from "../src/client";
import { fieldKeyFromLabel } from "../src/fields-shape";
import { QUALIFICATION } from "../src/qualification";

for (const [position, question] of QUALIFICATION.questions.entries()) {
	const key = fieldKeyFromLabel(question.label);
	const existing = await db.fieldDefinition.findUnique({
		where: { entity_key: { entity: "DEAL", key } },
		select: { id: true },
	});
	if (existing) {
		console.log(`exists  ${question.label}`);
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
