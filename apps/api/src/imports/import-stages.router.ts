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
	type ImportStageArchiveInput,
	type ImportStageCreateInput,
	type ImportStageKeyInput,
	type ImportStageReorderInput,
	type ImportStageUpdateInput,
	importStageArchiveInput,
	importStageCreateInput,
	importStageKeyInput,
	importStageReorderInput,
	importStageSettingsOutput,
	importStageUpdateInput,
} from "./import-stages.contracts";
import { ImportStagesService } from "./import-stages.service";

const TAGS = ["Import stages"];

@Router({ alias: "importStages" })
@UseMiddlewares(AuthMiddleware)
export class ImportStagesRouter {
	constructor(
		@Inject(ImportStagesService) private readonly stages: ImportStagesService,
	) {}

	@Query({
		output: importStageSettingsOutput,
		meta: restMeta("GET", "/import-stages", TAGS),
	})
	async settings(@Ctx() ctx: AuthedTrpcContext) {
		return this.stages.settings(ctx.user.id);
	}

	@Mutation({
		input: importStageCreateInput,
		output: importStageSettingsOutput,
		meta: restMeta("POST", "/import-stages", TAGS),
	})
	async create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportStageCreateInput,
	) {
		return this.stages.create(ctx.user.id, input);
	}

	@Mutation({
		input: importStageUpdateInput,
		output: importStageSettingsOutput,
		meta: restMeta("PATCH", "/import-stages/{key}", TAGS),
	})
	async update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportStageUpdateInput,
	) {
		return this.stages.update(ctx.user.id, input);
	}

	@Mutation({
		input: importStageReorderInput,
		output: importStageSettingsOutput,
		meta: restMeta("PUT", "/import-stages/order", TAGS),
	})
	async reorder(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportStageReorderInput,
	) {
		return this.stages.reorder(ctx.user.id, input);
	}

	@Mutation({
		input: importStageArchiveInput,
		output: importStageSettingsOutput,
		meta: restMeta("POST", "/import-stages/{key}/archive", TAGS),
	})
	async archive(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportStageArchiveInput,
	) {
		return this.stages.archive(ctx.user.id, input);
	}

	@Mutation({
		input: importStageKeyInput,
		output: importStageSettingsOutput,
		meta: restMeta("POST", "/import-stages/{key}/restore", TAGS),
	})
	async restore(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportStageKeyInput,
	) {
		return this.stages.restore(ctx.user.id, input.key);
	}
}
