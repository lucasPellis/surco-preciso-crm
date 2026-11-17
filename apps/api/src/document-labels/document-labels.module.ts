import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { DocumentLabelsRouter } from "./document-labels.router";
import { DocumentLabelsService } from "./document-labels.service";

@Module({
	imports: [TrpcModule],
	providers: [DocumentLabelsService, DocumentLabelsRouter],
})
export class DocumentLabelsModule {}
