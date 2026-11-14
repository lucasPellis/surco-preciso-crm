import { canManageStages, workspaceRoleOf } from "@crm/auth/organization";
import type { Db, Prisma } from "@crm/db";
import { PipelineStageKind } from "@crm/db/enums";
import {
	INTERMEDIATE_KINDS,
	isFixedStage,
	PIPELINE_STAGE,
	sameKeySet,
	uniqueStageKey,
} from "@crm/db/pipeline-stage";
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { InjectDatabase } from "../database/database.constants";
import { DealsService } from "./deals.service";
import type {
	ArchiveStageInput,
	CreateStageInput,
	ReorderStagesInput,
	StageSettings,
	UpdateStageInput,
} from "./pipeline-stages.contracts";

type StageRecord = Prisma.PipelineStageGetPayload<object>;

@Injectable()
export class PipelineStagesService {
	private readonly logger = new Logger(PipelineStagesService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
		private readonly deals: DealsService,
	) {}

	async settings(actingUserId: string): Promise<StageSettings> {
		const [rows, counts, role] = await Promise.all([
			this.db.pipelineStage.findMany({ orderBy: { position: "asc" } }),
			this.db.deal.groupBy({ by: ["stage"], _count: { _all: true } }),
			workspaceRoleOf(actingUserId),
		]);
		const perStage = new Map(counts.map((row) => [row.stage, row._count._all]));

		return {
			stages: rows.map((row) => ({
				key: row.key,
				name: row.name,
				kind: row.kind,
				tone: row.tone,
				position: row.position,
				isEntry: row.isEntry,
				idleAfterHours: row.idleAfterHours,
				archived: row.archivedAt !== null,
				dealCount: perStage.get(row.key) ?? 0,
			})),
			canManage: canManageStages(role),
		};
	}

	async create(
		actingUserId: string,
		input: CreateStageInput,
	): Promise<StageSettings> {
		await this.requireManager(actingUserId);
		const idle = this.idleFor(input.kind, input.idleAfterHours ?? null);

		await this.db.$transaction(async (tx) => {
			await this.assertNameFree(tx, input.name);
			const all = await tx.pipelineStage.findMany({
				select: { key: true, position: true, isEntry: true, kind: true },
			});
			const key = uniqueStageKey(
				input.name,
				new Set(all.map((row) => row.key)),
			);
			if (!key) {
				throw new BadRequestException(
					"A name needs at least one letter or digit.",
				);
			}
			await tx.pipelineStage.create({
				data: {
					key,
					name: input.name,
					kind: input.kind,
					tone: input.tone ?? PIPELINE_STAGE.defaultTone,
					idleAfterHours: idle,
					position: this.nextIntermediatePosition(all),
				},
			});
		});

		return this.settings(actingUserId);
	}

	async update(
		actingUserId: string,
		input: UpdateStageInput,
	): Promise<StageSettings> {
		await this.requireManager(actingUserId);

		await this.db.$transaction(async (tx) => {
			const stage = await this.lock(tx, input.key);
			await this.assertNameFree(tx, input.name, stage.key);

			const data: Prisma.PipelineStageUpdateInput = { name: input.name };

			if (input.tone !== undefined) {
				if (
					stage.kind === PipelineStageKind.WON ||
					stage.kind === PipelineStageKind.LOST
				) {
					throw new BadRequestException(
						"The tone of a closed stage cannot change.",
					);
				}
				data.tone = input.tone;
			}
			if (input.idleAfterHours !== undefined) {
				data.idleAfterHours = this.idleFor(stage.kind, input.idleAfterHours);
			}

			await tx.pipelineStage.update({ where: { key: stage.key }, data });
		});

		return this.settings(actingUserId);
	}

	async reorder(
		actingUserId: string,
		input: ReorderStagesInput,
	): Promise<StageSettings> {
		await this.requireManager(actingUserId);

		await this.db.$transaction(async (tx) => {
			await tx.$queryRaw`SELECT 1 FROM pipeline_stage FOR UPDATE`;
			const active = await tx.pipelineStage.findMany({
				where: { archivedAt: null },
			});
			const current = active
				.filter((row) => !isFixedStage(row))
				.map((row) => row.key);

			if (!sameKeySet(input.keys, current)) {
				throw new ConflictException(
					"The stages changed while you were reordering. Reload and try again.",
				);
			}

			for (const [index, key] of input.keys.entries()) {
				await tx.pipelineStage.update({
					where: { key },
					data: { position: PIPELINE_STAGE.firstIntermediatePosition + index },
				});
			}
		});

		return this.settings(actingUserId);
	}

	async archive(
		actingUserId: string,
		input: ArchiveStageInput,
	): Promise<StageSettings> {
		await this.requireManager(actingUserId);

		const moved = await this.agent.withCrmEvents(async (tx, emit) => {
			const stage = await this.lock(tx, input.key);
			if (isFixedStage(stage)) {
				throw new BadRequestException("A fixed stage cannot be archived.");
			}
			if (stage.archivedAt) {
				throw new ConflictException("That stage is already archived.");
			}

			const dealIds = await tx.deal.findMany({
				where: { stage: stage.key },
				orderBy: { createdAt: "asc" },
				select: { id: true },
			});

			const touched: Array<{ companyId: string; dealId: string; now: Date }> =
				[];

			if (dealIds.length > 0) {
				if (!input.targetKey) {
					throw new ConflictException(
						`Choose a stage for the ${dealIds.length} deals in this stage before archiving it.`,
					);
				}
				await this.assertTarget(tx, input.targetKey, stage.key);

				for (const deal of dealIds) {
					const result = await this.deals.moveInTx(
						tx,
						emit,
						{ id: deal.id, stage: input.targetKey },
						actingUserId,
					);
					if (result.changed) {
						touched.push({
							companyId: result.deal.companyId,
							dealId: result.deal.id,
							now: result.now,
						});
					}
				}
			}

			await tx.pipelineStage.update({
				where: { key: stage.key },
				data: { archivedAt: new Date() },
			});

			return touched;
		});

		await this.deals.touchMoved(moved);
		this.logger.log({
			message: "Pipeline stage archived",
			stage: input.key,
			dealsMoved: moved.length,
		});

		return this.settings(actingUserId);
	}

	async restore(actingUserId: string, key: string): Promise<StageSettings> {
		await this.requireManager(actingUserId);

		await this.db.$transaction(async (tx) => {
			const stage = await this.lock(tx, key);
			if (!stage.archivedAt) {
				throw new ConflictException("That stage is not archived.");
			}
			const all = await tx.pipelineStage.findMany({
				select: { key: true, position: true, isEntry: true, kind: true },
			});
			await tx.pipelineStage.update({
				where: { key },
				data: {
					archivedAt: null,
					position: this.nextIntermediatePosition(all),
				},
			});
		});

		return this.settings(actingUserId);
	}

	private nextIntermediatePosition(
		rows: Array<{
			position: number;
			isEntry: boolean;
			kind: PipelineStageKind;
		}>,
	): number {
		const last = rows
			.filter((row) => !isFixedStage(row))
			.reduce(
				(max, row) => Math.max(max, row.position),
				PIPELINE_STAGE.firstIntermediatePosition - 1,
			);
		return last + 1;
	}

	private idleFor(
		kind: PipelineStageKind,
		hours: number | null,
	): number | null {
		if (hours === null) return null;
		if (kind !== PipelineStageKind.OPEN) {
			throw new BadRequestException(
				"Only an open stage can have an idle alert.",
			);
		}
		return hours;
	}

	private async lock(
		tx: Prisma.TransactionClient,
		key: string,
	): Promise<StageRecord> {
		await tx.$queryRaw`
			SELECT 1 FROM pipeline_stage WHERE "key" = ${key} FOR UPDATE
		`;
		const stage = await tx.pipelineStage.findUnique({ where: { key } });
		if (!stage) throw new NotFoundException("No stage with that key.");
		return stage;
	}

	private async assertTarget(
		tx: Prisma.TransactionClient,
		targetKey: string,
		sourceKey: string,
	): Promise<void> {
		if (targetKey === sourceKey) {
			throw new BadRequestException("Choose a different stage for the deals.");
		}
		const target = await tx.pipelineStage.findUnique({
			where: { key: targetKey },
		});
		if (
			!target ||
			target.archivedAt ||
			!(INTERMEDIATE_KINDS as readonly PipelineStageKind[]).includes(
				target.kind,
			)
		) {
			throw new BadRequestException(
				"The deals can only move to an active open or paused stage.",
			);
		}
	}

	private async assertNameFree(
		tx: Prisma.TransactionClient,
		name: string,
		exceptKey?: string,
	): Promise<void> {
		const existing = await tx.pipelineStage.findFirst({
			where: {
				name: { equals: name, mode: "insensitive" },
				key: exceptKey ? { not: exceptKey } : undefined,
			},
			select: { key: true },
		});
		if (existing) {
			throw new ConflictException(`A stage called ${name} already exists.`);
		}
	}

	private async requireManager(userId: string): Promise<void> {
		if (!canManageStages(await workspaceRoleOf(userId))) {
			throw new ForbiddenException(
				"Only an owner or an admin can change the stages.",
			);
		}
	}
}
