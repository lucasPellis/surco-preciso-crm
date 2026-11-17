import { Module } from "@nestjs/common";
import { ImportOrdersModule } from "../import-orders/import-orders.module";
import { TrpcModule } from "../trpc/trpc.module";
import { ImportDocumentsRouter } from "./import-documents.router";
import { ImportDocumentsService } from "./import-documents.service";

@Module({
	imports: [TrpcModule, ImportOrdersModule],
	providers: [ImportDocumentsService, ImportDocumentsRouter],
})
export class ImportDocumentsModule {}
