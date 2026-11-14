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
	type CreateLeadSourceInput,
	createLeadSourceInput,
	type LeadSourceIdInput,
	leadSourceIdInput,
	leadSourceListOutput,
	type ReorderLeadSourcesInput,
	reorderLeadSourcesInput,
	type UpdateLeadSourceInput,
	updateLeadSourceInput,
} from "./lead-sources.contracts";
import { LeadSourcesService } from "./lead-sources.service";

const TAGS = ["Lead sources"];

@Router({ alias: "leadSources" })
@UseMiddlewares(AuthMiddleware)
export class LeadSourcesRouter {
	constructor(
		@Inject(LeadSourcesService) private readonly sources: LeadSourcesService,
	) {}

	@Query({
		output: leadSourceListOutput,
		meta: restMeta("GET", "/lead-sources", TAGS),
	})
	async list(@Ctx() ctx: AuthedTrpcContext) {
		return this.sources.list(ctx.user.id);
	}

	@Mutation({
		input: createLeadSourceInput,
		output: leadSourceListOutput,
		meta: restMeta("POST", "/lead-sources", TAGS),
	})
	async create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: CreateLeadSourceInput,
	) {
		return this.sources.create(ctx.user.id, input.name, input.icon ?? null);
	}

	@Mutation({
		input: updateLeadSourceInput,
		output: leadSourceListOutput,
		meta: restMeta("PATCH", "/lead-sources/{id}", TAGS),
	})
	async update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: UpdateLeadSourceInput,
	) {
		return this.sources.update(ctx.user.id, input.id, input.name, input.icon);
	}

	@Mutation({
		input: leadSourceIdInput,
		output: leadSourceListOutput,
		meta: restMeta("POST", "/lead-sources/{id}/archive", TAGS),
	})
	async archive(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: LeadSourceIdInput,
	) {
		return this.sources.archive(ctx.user.id, input.id);
	}

	@Mutation({
		input: leadSourceIdInput,
		output: leadSourceListOutput,
		meta: restMeta("POST", "/lead-sources/{id}/restore", TAGS),
	})
	async restore(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: LeadSourceIdInput,
	) {
		return this.sources.restore(ctx.user.id, input.id);
	}

	@Mutation({
		input: reorderLeadSourcesInput,
		output: leadSourceListOutput,
		meta: restMeta("PUT", "/lead-sources/order", TAGS),
	})
	async reorder(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ReorderLeadSourcesInput,
	) {
		return this.sources.reorder(ctx.user.id, input.ids);
	}
}
