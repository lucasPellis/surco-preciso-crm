import { db } from "../src/client";
import { DocumentDirection } from "../src/generated/prisma/enums";

const PROCESS = "Courier Argentina";

const LABELS = [
	{ name: "Commercial invoice", direction: DocumentDirection.IN },
	{ name: "Packing list", direction: DocumentDirection.IN },
	{ name: "Informe de pedido tomado", direction: DocumentDirection.IN },
	{ name: "Costos de importación", direction: DocumentDirection.IN },
	{ name: "Comprobante de pago", direction: DocumentDirection.OUT },
	{ name: "Presentación al banco", direction: DocumentDirection.OUT },
];

const EXPECTED: ReadonlyArray<{ stage: string; labels: readonly string[] }> = [
	{
		stage: "Documentos de fábrica",
		labels: ["Commercial invoice", "Packing list"],
	},
	{ stage: "Con DHL", labels: ["Informe de pedido tomado"] },
	{ stage: "Costos de importación", labels: ["Costos de importación"] },
	{ stage: "Pago", labels: ["Comprobante de pago"] },
	{
		stage: "Presentado al banco",
		labels: ["Commercial invoice", "Packing list", "Comprobante de pago"],
	},
];

const ids = new Map<string, string>();

for (const label of LABELS) {
	const found = await db.documentLabel.findFirst({
		where: { name: { equals: label.name, mode: "insensitive" } },
		select: { id: true },
	});
	if (found) {
		ids.set(label.name, found.id);
		console.log(`exists  ${label.name}`);
		continue;
	}
	const created = await db.documentLabel.create({
		data: label,
		select: { id: true },
	});
	ids.set(label.name, created.id);
	console.log(`created ${label.name}`);
}

const courier = await db.importProcess.findUnique({
	where: { name: PROCESS },
	select: { id: true },
});

if (!courier) {
	console.log(`missing ${PROCESS}. Run db:seed:courier-ar first.`);
} else {
	for (const entry of EXPECTED) {
		const stage = await db.importStage.findFirst({
			where: { processId: courier.id, name: entry.stage },
			select: { key: true },
		});
		if (!stage) {
			console.log(`missing stage ${entry.stage}`);
			continue;
		}
		for (const [position, name] of entry.labels.entries()) {
			const labelId = ids.get(name);
			if (!labelId) continue;
			await db.importStageDocument.upsert({
				where: { stageKey_labelId: { stageKey: stage.key, labelId } },
				update: {},
				create: { stageKey: stage.key, labelId, position },
			});
		}
		console.log(`linked  ${entry.stage}: ${entry.labels.join(", ")}`);
	}
}

await db.$disconnect();
