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
	type DocumentLabelCreateInput,
	type DocumentLabelIdInput,
	type DocumentLabelUpdateInput,
	documentLabelCreateInput,
	documentLabelIdInput,
	documentLabelListOutput,
	documentLabelUpdateInput,
} from "./document-labels.contracts";
import { DocumentLabelsService } from "./document-labels.service";

const TAGS = ["Document labels"];

@Router({ alias: "documentLabels" })
@UseMiddlewares(AuthMiddleware)
export class DocumentLabelsRouter {
	constructor(
		@Inject(DocumentLabelsService)
		private readonly labels: DocumentLabelsService,
	) {}

	@Query({
		output: documentLabelListOutput,
		meta: restMeta("GET", "/document-labels", TAGS),
	})
	async list(@Ctx() ctx: AuthedTrpcContext) {
		return this.labels.list(ctx.user.id);
	}

	@Mutation({
		input: documentLabelCreateInput,
		output: documentLabelListOutput,
		meta: restMeta("POST", "/document-labels", TAGS),
	})
	async create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: DocumentLabelCreateInput,
	) {
		return this.labels.create(ctx.user.id, input);
	}

	@Mutation({
		input: documentLabelUpdateInput,
		output: documentLabelListOutput,
		meta: restMeta("PATCH", "/document-labels/{id}", TAGS),
	})
	async update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: DocumentLabelUpdateInput,
	) {
		return this.labels.update(ctx.user.id, input);
	}

	@Mutation({
		input: documentLabelIdInput,
		output: documentLabelListOutput,
		meta: restMeta("POST", "/document-labels/{id}/archive", TAGS),
	})
	async archive(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: DocumentLabelIdInput,
	) {
		return this.labels.archive(ctx.user.id, input.id);
	}

	@Mutation({
		input: documentLabelIdInput,
		output: documentLabelListOutput,
		meta: restMeta("POST", "/document-labels/{id}/restore", TAGS),
	})
	async restore(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: DocumentLabelIdInput,
	) {
		return this.labels.restore(ctx.user.id, input.id);
	}
}
