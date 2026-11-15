import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	type ImportOrderCreateInput,
	type ImportOrderIdInput,
	type ImportOrderListInput,
	type ImportOrderUpdateInput,
	importOrderCreateInput,
	importOrderDetailOutput,
	importOrderIdInput,
	importOrderListInput,
	importOrderListOutput,
	importOrderOptionsOutput,
	importOrderUpdateInput,
	type ShipmentCreateInput,
	type ShipmentMoveRequest,
	type ShipmentUpdateInput,
	shipmentCreateInput,
	shipmentMoveRequest,
	shipmentUpdateInput,
} from "./import-orders.contracts";
import { ImportOrdersService } from "./import-orders.service";

const TAGS = ["Import orders"];

@Router({ alias: "importOrders" })
@UseMiddlewares(AuthMiddleware)
export class ImportOrdersRouter {
	constructor(
		@Inject(ImportOrdersService) private readonly orders: ImportOrdersService,
	) {}

	@Query({
		input: importOrderListInput,
		output: importOrderListOutput,
		meta: restMeta("POST", "/import-orders/search", TAGS),
	})
	async list(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportOrderListInput,
	) {
		return this.orders.list(ctx.user.id, input);
	}

	@Query({
		output: importOrderOptionsOutput,
		meta: restMeta("GET", "/import-order-options", TAGS),
	})
	async options() {
		return this.orders.options();
	}

	@Query({
		input: importOrderIdInput,
		output: importOrderDetailOutput,
		meta: restMeta("GET", "/import-orders/{id}", TAGS),
	})
	async byId(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportOrderIdInput,
	) {
		return this.orders.detail(ctx.user.id, input.id);
	}

	@Mutation({
		input: importOrderCreateInput,
		output: importOrderDetailOutput,
		meta: restMeta("POST", "/import-orders", TAGS),
	})
	async create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportOrderCreateInput,
	) {
		return this.orders.create(ctx.user.id, input);
	}

	@Mutation({
		input: importOrderUpdateInput,
		output: importOrderDetailOutput,
		meta: restMeta("PATCH", "/import-orders/{id}", TAGS),
	})
	async update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportOrderUpdateInput,
	) {
		return this.orders.update(ctx.user.id, input);
	}

	@Mutation({
		input: importOrderIdInput,
		output: importOrderDetailOutput,
		meta: restMeta("POST", "/import-orders/{id}/archive", TAGS),
	})
	async archive(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportOrderIdInput,
	) {
		return this.orders.archive(ctx.user.id, input.id);
	}

	@Mutation({
		input: importOrderIdInput,
		output: importOrderDetailOutput,
		meta: restMeta("POST", "/import-orders/{id}/restore", TAGS),
	})
	async restore(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportOrderIdInput,
	) {
		return this.orders.restore(ctx.user.id, input.id);
	}

	@Mutation({
		input: shipmentCreateInput,
		output: importOrderDetailOutput,
		meta: restMeta("POST", "/import-orders/{orderId}/shipments", TAGS),
	})
	async createShipment(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ShipmentCreateInput,
	) {
		return this.orders.createShipment(ctx.user.id, input);
	}

	@Mutation({
		input: shipmentUpdateInput,
		output: importOrderDetailOutput,
		meta: restMeta("PATCH", "/shipments/{id}", TAGS),
	})
	async updateShipment(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ShipmentUpdateInput,
	) {
		return this.orders.updateShipment(ctx.user.id, input);
	}

	@Mutation({
		input: shipmentMoveRequest,
		output: importOrderDetailOutput,
		meta: restMeta("POST", "/shipments/{shipmentId}/move", TAGS),
	})
	async moveShipment(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ShipmentMoveRequest,
	) {
		return this.orders.moveShipment(ctx.user.id, input);
	}
}
