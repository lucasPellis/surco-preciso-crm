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
	type ImportProcessCreateInput,
	type ImportProcessDuplicateInput,
	type ImportProcessIdInput,
	type ImportProcessUpdateInput,
	importProcessCreateInput,
	importProcessDuplicateInput,
	importProcessIdInput,
	importProcessListOutput,
	importProcessUpdateInput,
} from "./import-processes.contracts";
import { ImportProcessesService } from "./import-processes.service";

const TAGS = ["Import processes"];

@Router({ alias: "importProcesses" })
@UseMiddlewares(AuthMiddleware)
export class ImportProcessesRouter {
	constructor(
		@Inject(ImportProcessesService)
		private readonly processes: ImportProcessesService,
	) {}

	@Query({
		output: importProcessListOutput,
		meta: restMeta("GET", "/import-processes", TAGS),
	})
	async list(@Ctx() ctx: AuthedTrpcContext) {
		return this.processes.list(ctx.user.id);
	}

	@Mutation({
		input: importProcessCreateInput,
		output: importProcessListOutput,
		meta: restMeta("POST", "/import-processes", TAGS),
	})
	async create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportProcessCreateInput,
	) {
		return this.processes.create(ctx.user.id, input);
	}

	@Mutation({
		input: importProcessUpdateInput,
		output: importProcessListOutput,
		meta: restMeta("PATCH", "/import-processes/{id}", TAGS),
	})
	async update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportProcessUpdateInput,
	) {
		return this.processes.update(ctx.user.id, input);
	}

	@Mutation({
		input: importProcessDuplicateInput,
		output: importProcessListOutput,
		meta: restMeta("POST", "/import-processes/{id}/duplicate", TAGS),
	})
	async duplicate(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportProcessDuplicateInput,
	) {
		return this.processes.duplicate(ctx.user.id, input);
	}

	@Mutation({
		input: importProcessIdInput,
		output: importProcessListOutput,
		meta: restMeta("POST", "/import-processes/{id}/archive", TAGS),
	})
	async archive(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportProcessIdInput,
	) {
		return this.processes.archive(ctx.user.id, input.id);
	}

	@Mutation({
		input: importProcessIdInput,
		output: importProcessListOutput,
		meta: restMeta("POST", "/import-processes/{id}/restore", TAGS),
	})
	async restore(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportProcessIdInput,
	) {
		return this.processes.restore(ctx.user.id, input.id);
	}
}
