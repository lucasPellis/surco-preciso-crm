import { canManageInventory, workspaceRoleOf } from "@crm/auth/organization";
import type { Db } from "@crm/db";
import { Prisma } from "@crm/db";
import { normalizeSku } from "@crm/db/product";
import {
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { blankToNull, decimalFromCents, toCents } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";
import {
	archivedFilter,
	countsByKey,
	type OrderByColumns,
	paginate,
	resolveOrderBy,
} from "../trpc/list-input";
import type {
	ProductCreateInput,
	ProductList,
	ProductListInput,
	ProductRow,
	ProductUpdateInput,
} from "./products.contracts";

const SORTABLE: OrderByColumns<Prisma.ProductOrderByWithRelationInput> = {
	sku: (dir) => ({ sku: dir }),
	name: (dir) => ({ name: dir }),
	brand: (dir) => ({ brand: { sort: dir, nulls: "last" } }),
	category: (dir) => ({ category: { sort: dir, nulls: "last" } }),
	referenceCost: (dir) => ({ referenceCostUsd: { sort: dir, nulls: "last" } }),
	createdAt: (dir) => ({ createdAt: dir }),
	archivedAt: (dir) => ({ archivedAt: { sort: dir, nulls: "last" } }),
};

const SELECT = {
	id: true,
	sku: true,
	name: true,
	brand: true,
	category: true,
	description: true,
	referenceCostUsd: true,
	archivedAt: true,
	createdAt: true,
} satisfies Prisma.ProductSelect;

type ProductRecord = Prisma.ProductGetPayload<{ select: typeof SELECT }>;

function toRow(record: ProductRecord): ProductRow {
	return {
		id: record.id,
		sku: record.sku,
		name: record.name,
		brand: record.brand,
		category: record.category,
		description: record.description,
		referenceCostCents: toCents(record.referenceCostUsd),
		archivedAt: record.archivedAt?.toISOString() ?? null,
		createdAt: record.createdAt.toISOString(),
	};
}

@Injectable()
export class ProductsService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async list(
		actingUserId: string,
		input: ProductListInput,
	): Promise<ProductList> {
		const where = this.buildWhere(input);
		const { skip, take } = paginate(input);

		const [rows, total, categories, role] = await Promise.all([
			this.db.product.findMany({
				where,
				skip,
				take,
				orderBy: resolveOrderBy(input, SORTABLE, { createdAt: "desc" }),
				select: SELECT,
			}),
			this.db.product.count({ where }),
			this.db.product.groupBy({
				by: ["category"],
				where: archivedFilter(input.archived),
				_count: { _all: true },
			}),
			workspaceRoleOf(actingUserId),
		]);

		return {
			rows: rows.map(toRow),
			total,
			facetCounts: { category: countsByKey(categories, "category") },
			canManage: canManageInventory(role),
		};
	}

	async create(
		actingUserId: string,
		input: ProductCreateInput,
	): Promise<ProductRow> {
		await this.requireManager(actingUserId);
		const sku = normalizeSku(input.sku);
		try {
			const created = await this.db.product.create({
				data: this.data(input, sku),
				select: SELECT,
			});
			return toRow(created);
		} catch (error) {
			throw this.translate(error, sku);
		}
	}

	async update(
		actingUserId: string,
		input: ProductUpdateInput,
	): Promise<ProductRow> {
		await this.requireManager(actingUserId);
		const sku = normalizeSku(input.sku);
		try {
			const updated = await this.db.product.update({
				where: { id: input.id },
				data: this.data(input, sku),
				select: SELECT,
			});
			return toRow(updated);
		} catch (error) {
			throw this.translate(error, sku);
		}
	}

	async archive(actingUserId: string, id: string): Promise<ProductRow> {
		return this.setArchived(actingUserId, id, new Date());
	}

	async restore(actingUserId: string, id: string): Promise<ProductRow> {
		return this.setArchived(actingUserId, id, null);
	}

	private async setArchived(
		actingUserId: string,
		id: string,
		archivedAt: Date | null,
	): Promise<ProductRow> {
		await this.requireManager(actingUserId);
		try {
			const updated = await this.db.product.update({
				where: { id },
				data: { archivedAt },
				select: SELECT,
			});
			return toRow(updated);
		} catch (error) {
			throw this.translate(error, "");
		}
	}

	private buildWhere(input: ProductListInput): Prisma.ProductWhereInput {
		const search = input.q.trim();
		return {
			AND: [
				archivedFilter(input.archived),
				input.category.length > 0 ? { category: { in: input.category } } : {},
				search === ""
					? {}
					: {
							OR: [
								{ sku: { contains: search, mode: "insensitive" } },
								{ name: { contains: search, mode: "insensitive" } },
								{ brand: { contains: search, mode: "insensitive" } },
							],
						},
			],
		};
	}

	private data(input: ProductCreateInput, sku: string) {
		return {
			sku,
			name: input.name,
			brand: blankToNull(input.brand),
			category: blankToNull(input.category),
			description: blankToNull(input.description),
			referenceCostUsd: decimalFromCents(input.referenceCostCents),
		};
	}

	private async requireManager(userId: string): Promise<void> {
		if (!canManageInventory(await workspaceRoleOf(userId))) {
			throw new ForbiddenException(
				"Solo un propietario o un administrador puede cambiar el catálogo.",
			);
		}
	}

	private translate(cause: unknown, sku: string): never {
		if (cause instanceof Prisma.PrismaClientKnownRequestError) {
			if (cause.code === "P2025") {
				throw new NotFoundException("No existe un producto con ese id.");
			}
			if (cause.code === "P2002") {
				throw new ConflictException(`Ya existe un producto con el SKU ${sku}.`);
			}
		}
		throw cause;
	}
}
