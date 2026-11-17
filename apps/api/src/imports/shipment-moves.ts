import type { Prisma } from "@crm/db";
import type { ImportStageKind } from "@crm/db/enums";
import { isClosedImportKind } from "@crm/db/import-stage";
import {
	BadRequestException,
	ConflictException,
	NotFoundException,
} from "@nestjs/common";
import {
	serializeTaskDueDay,
	taskDayBoundaries,
	taskDueDay,
} from "../activities/task-due-date";

export type ShipmentMoveInput = {
	shipmentId: string;
	targetKey: string;
	occurredOn: string;
	actorId: string;
};

type StageRef = { key: string; kind: ImportStageKind };

export type ShipmentMoved = {
	shipmentId: string;
	from: StageRef;
	to: StageRef;
	occurredAt: Date;
};

export async function moveShipmentInTx(
	tx: Prisma.TransactionClient,
	input: ShipmentMoveInput,
	now: Date = new Date(),
): Promise<ShipmentMoved> {
	const [shipment] = await tx.$queryRaw<
		Array<{ id: string; stageKey: string; processId: string }>
	>`
		SELECT s.id, s."stageKey", o."processId"
		FROM shipment s
		JOIN purchase_order o ON o.id = s."orderId"
		WHERE s.id = ${input.shipmentId}
		FOR UPDATE OF s
	`;
	if (!shipment) {
		throw new NotFoundException("No existe un envío con ese id.");
	}
	if (shipment.stageKey === input.targetKey) {
		throw new BadRequestException("El envío ya está en esa etapa.");
	}

	await tx.$queryRaw`
		SELECT 1 FROM import_stage WHERE "key" = ${input.targetKey} FOR SHARE
	`;
	const from = await tx.importStage.findUniqueOrThrow({
		where: { key: shipment.stageKey },
		select: { key: true, kind: true },
	});
	const to = await tx.importStage.findUnique({
		where: { key: input.targetKey },
		select: { key: true, kind: true, archivedAt: true, processId: true },
	});
	const last = await tx.shipmentStageEvent.findFirst({
		where: { shipmentId: shipment.id },
		orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
		select: { occurredAt: true },
	});

	if (isClosedImportKind(from.kind)) {
		throw new ConflictException(
			"Un envío recibido o cancelado ya no cambia de etapa.",
		);
	}
	if (!to || to.archivedAt) {
		throw new BadRequestException("Esa etapa no está disponible.");
	}
	if (to.processId !== shipment.processId) {
		throw new BadRequestException("Esa etapa es de otro proceso.");
	}

	const occurredAt = taskDueDay(input.occurredOn);
	if (occurredAt >= taskDayBoundaries(now).startOfTomorrow) {
		throw new BadRequestException("La fecha no puede ser posterior a hoy.");
	}
	if (last && occurredAt < last.occurredAt) {
		throw new BadRequestException(
			`La fecha no puede ser anterior al ${serializeTaskDueDay(last.occurredAt)}, la del cambio anterior.`,
		);
	}

	await tx.shipmentStageEvent.create({
		data: {
			shipmentId: shipment.id,
			stageKey: to.key,
			occurredAt,
			actorId: input.actorId,
		},
	});
	await tx.shipment.update({
		where: { id: shipment.id },
		data: { stageKey: to.key, stageChangedAt: occurredAt },
	});

	return {
		shipmentId: shipment.id,
		from,
		to: { key: to.key, kind: to.kind },
		occurredAt,
	};
}
