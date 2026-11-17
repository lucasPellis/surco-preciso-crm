import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import { importOrderDetailOutput } from "../import-orders/import-orders.contracts";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	type DocumentAttachInput,
	type DocumentIdInput,
	type DocumentUploadInput,
	documentAttachInput,
	documentDownloadOutput,
	documentIdInput,
	documentUploadInput,
	documentUploadOutput,
} from "./import-documents.contracts";
import { ImportDocumentsService } from "./import-documents.service";

const TAGS = ["Import documents"];

@Router({ alias: "importDocuments" })
@UseMiddlewares(AuthMiddleware)
export class ImportDocumentsRouter {
	constructor(
		@Inject(ImportDocumentsService)
		private readonly documents: ImportDocumentsService,
	) {}

	@Mutation({
		input: documentUploadInput,
		output: documentUploadOutput,
		meta: restMeta("POST", "/import-documents/upload-token", TAGS),
	})
	async uploadToken(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: DocumentUploadInput,
	) {
		return this.documents.uploadToken(ctx.user.id, input);
	}

	@Mutation({
		input: documentAttachInput,
		output: importOrderDetailOutput,
		meta: restMeta("POST", "/import-documents", TAGS),
	})
	async attach(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: DocumentAttachInput,
	) {
		return this.documents.attach(ctx.user.id, input);
	}

	@Mutation({
		input: documentIdInput,
		output: importOrderDetailOutput,
		meta: restMeta("DELETE", "/import-documents/{id}", TAGS),
	})
	async remove(@Ctx() ctx: AuthedTrpcContext, @Input() input: DocumentIdInput) {
		return this.documents.remove(ctx.user.id, input.id);
	}

	@Query({
		input: documentIdInput,
		output: documentDownloadOutput,
		meta: restMeta("GET", "/import-documents/{id}/download-url", TAGS),
	})
	async downloadUrl(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: DocumentIdInput,
	) {
		return this.documents.downloadUrl(ctx.user.id, input.id);
	}
}
