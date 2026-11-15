import { db } from "../src/client";
import { ImportCountry, ImportStageKind } from "../src/generated/prisma/enums";
import { IMPORT_PROCESS, keyedStages } from "../src/import-process";
import { IMPORT_STAGE } from "../src/import-stage";

const NAME = "Courier Argentina";

const STEPS = [
	"Documentos de fábrica",
	"Enviado al courier",
	"Con DHL",
	"Costos de importación",
	"Pago",
	"Presentado al banco",
	"Decisión del banco",
];

const existing = await db.importProcess.findUnique({
	where: { name: NAME },
	select: { id: true },
});

if (existing) {
	console.log(`exists  ${NAME}`);
} else {
	const [entry, received, cancelled] = IMPORT_PROCESS.fixedStages;
	const middle = STEPS.map((name, index) => ({
		name,
		kind: ImportStageKind.IN_PROGRESS,
		tone: IMPORT_STAGE.defaultTone,
		position: IMPORT_STAGE.firstIntermediatePosition + index,
		isEntry: false,
	}));
	const taken = new Set(
		(await db.importStage.findMany({ select: { key: true } })).map(
			(row) => row.key,
		),
	);
	await db.importProcess.create({
		data: {
			name: NAME,
			countryCode: ImportCountry.AR,
			stages: {
				create: keyedStages([entry, ...middle, received, cancelled], taken),
			},
		},
	});
	console.log(`created ${NAME} with ${STEPS.length + 3} stages`);
}

await db.$disconnect();
