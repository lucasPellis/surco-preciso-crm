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
	type ProductCreateInput,
	type ProductIdInput,
	type ProductListInput,
	type ProductUpdateInput,
	productCreateInput,
	productIdInput,
	productListInput,
	productListOutput,
	productOutput,
	productUpdateInput,
} from "./products.contracts";
import { ProductsService } from "./products.service";

const TAGS = ["Products"];

@Router({ alias: "products" })
@UseMiddlewares(AuthMiddleware)
export class ProductsRouter {
	constructor(
		@Inject(ProductsService) private readonly products: ProductsService,
	) {}

	@Query({
		input: productListInput,
		output: productListOutput,
		meta: restMeta("POST", "/products/search", TAGS),
	})
	async list(@Ctx() ctx: AuthedTrpcContext, @Input() input: ProductListInput) {
		return this.products.list(ctx.user.id, input);
	}

	@Mutation({
		input: productCreateInput,
		output: productOutput,
		meta: restMeta("POST", "/products", TAGS),
	})
	async create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ProductCreateInput,
	) {
		return this.products.create(ctx.user.id, input);
	}

	@Mutation({
		input: productUpdateInput,
		output: productOutput,
		meta: restMeta("PATCH", "/products/{id}", TAGS),
	})
	async update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ProductUpdateInput,
	) {
		return this.products.update(ctx.user.id, input);
	}

	@Mutation({
		input: productIdInput,
		output: productOutput,
		meta: restMeta("POST", "/products/{id}/archive", TAGS),
	})
	async archive(@Ctx() ctx: AuthedTrpcContext, @Input() input: ProductIdInput) {
		return this.products.archive(ctx.user.id, input.id);
	}

	@Mutation({
		input: productIdInput,
		output: productOutput,
		meta: restMeta("POST", "/products/{id}/restore", TAGS),
	})
	async restore(@Ctx() ctx: AuthedTrpcContext, @Input() input: ProductIdInput) {
		return this.products.restore(ctx.user.id, input.id);
	}
}
