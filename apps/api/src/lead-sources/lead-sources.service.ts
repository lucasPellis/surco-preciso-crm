import {
	canManageLeadSources,
	WORKSPACE_ID,
	workspaceRoleOf,
} from "@crm/auth/organization";
import type { Db } from "@crm/db";
import { Prisma } from "@crm/db";
import { type LeadSourceIcon, leadSourceKey } from "@crm/db/lead-source";
import { readDefaultLeadOwner, writeDefaultLeadOwner } from "@crm/db/settings";
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type { LeadSourceList } from "./lead-sources.contracts";

@Injectable()
export class LeadSourcesService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async list(actingUserId: string): Promise<LeadSourceList> {
		const [rows, usage] = await Promise.all([
			this.db.leadSource.findMany({
				orderBy: [{ position: "asc" }, { name: "asc" }],
				select: {
					id: true,
					key: true,
					name: true,
					icon: true,
					archivedAt: true,
				},
			}),
			this.db.contact.groupBy({
				by: ["leadSourceId"],
				where: { archivedAt: null, leadSourceId: { not: null } },
				_count: { _all: true },
			}),
		]);
		const counts = new Map(
			usage.map((row) => [row.leadSourceId, row._count._all]),
		);

		return {
			sources: rows.map((row) => ({
				id: row.id,
				key: row.key,
				name: row.name,
				icon: row.icon,
				archived: row.archivedAt !== null,
				contacts: counts.get(row.id) ?? 0,
			})),
			canManage: canManageLeadSources(await workspaceRoleOf(actingUserId)),
			defaultOwnerId: await readDefaultLeadOwner(this.db),
		};
	}

	async setDefaultOwner(
		actingUserId: string,
		ownerId: string | null,
	): Promise<LeadSourceList> {
		await this.requireManager(actingUserId);

		if (ownerId) {
			const member = await this.db.member.findFirst({
				where: { userId: ownerId, organizationId: WORKSPACE_ID },
				select: { id: true },
			});
			if (!member) {
				throw new BadRequestException("That user is not in the workspace.");
			}
		}

		await writeDefaultLeadOwner(this.db, ownerId);

		return this.list(actingUserId);
	}

	async create(
		actingUserId: string,
		name: string,
		icon: LeadSourceIcon | null,
	): Promise<LeadSourceList> {
		await this.requireManager(actingUserId);

		const clean = name.trim();
		const key = leadSourceKey(clean);
		if (!key) {
			throw new BadRequestException(
				"A name needs at least one letter or digit.",
			);
		}
		await this.assertNameFree(clean);

		const last = await this.db.leadSource.aggregate({
			_max: { position: true },
		});

		try {
			await this.db.leadSource.create({
				data: {
					key,
					name: clean,
					icon,
					position: (last._max.position ?? -1) + 1,
				},
				select: { id: true },
			});
		} catch (error) {
			throw this.translate(error);
		}

		return this.list(actingUserId);
	}

	async update(
		actingUserId: string,
		id: string,
		name: string,
		icon: LeadSourceIcon | null,
	): Promise<LeadSourceList> {
		await this.requireManager(actingUserId);

		const clean = name.trim();
		await this.assertNameFree(clean, id);

		try {
			await this.db.leadSource.update({
				where: { id },
				data: { name: clean, icon },
				select: { id: true },
			});
		} catch (error) {
			throw this.translate(error);
		}

		return this.list(actingUserId);
	}

	async archive(actingUserId: string, id: string): Promise<LeadSourceList> {
		return this.setArchived(actingUserId, id, new Date());
	}

	async restore(actingUserId: string, id: string): Promise<LeadSourceList> {
		return this.setArchived(actingUserId, id, null);
	}

	async reorder(actingUserId: string, ids: string[]): Promise<LeadSourceList> {
		await this.requireManager(actingUserId);

		if (new Set(ids).size !== ids.length) {
			throw new BadRequestException("A source appears twice in that order.");
		}
		const found = await this.db.leadSource.count({
			where: { id: { in: ids } },
		});
		if (found !== ids.length) {
			throw new NotFoundException("One of those sources does not exist.");
		}

		await this.db.$transaction(
			ids.map((id, position) =>
				this.db.leadSource.update({
					where: { id },
					data: { position },
					select: { id: true },
				}),
			),
		);

		return this.list(actingUserId);
	}

	private async setArchived(
		actingUserId: string,
		id: string,
		archivedAt: Date | null,
	): Promise<LeadSourceList> {
		await this.requireManager(actingUserId);

		try {
			await this.db.leadSource.update({
				where: { id },
				data: { archivedAt },
				select: { id: true },
			});
		} catch (error) {
			throw this.translate(error);
		}

		return this.list(actingUserId);
	}

	private async assertNameFree(name: string, exceptId?: string) {
		const existing = await this.db.leadSource.findFirst({
			where: {
				name: { equals: name, mode: "insensitive" },
				id: exceptId ? { not: exceptId } : undefined,
			},
			select: { id: true },
		});
		if (existing) {
			throw new ConflictException(`A source called ${name} already exists.`);
		}
	}

	private async requireManager(userId: string): Promise<void> {
		if (!canManageLeadSources(await workspaceRoleOf(userId))) {
			throw new ForbiddenException(
				"Only an owner or an admin can change the lead sources.",
			);
		}
	}

	private translate(cause: unknown): never {
		if (cause instanceof Prisma.PrismaClientKnownRequestError) {
			if (cause.code === "P2025") {
				throw new NotFoundException("No lead source with that id.");
			}
			if (cause.code === "P2002") {
				throw new ConflictException(
					"Another source already has almost the same name.",
				);
			}
		}
		throw cause;
	}
}
