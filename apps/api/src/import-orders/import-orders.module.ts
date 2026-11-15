import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { ImportOrdersRouter } from "./import-orders.router";
import { ImportOrdersService } from "./import-orders.service";

@Module({
	imports: [TrpcModule],
	providers: [ImportOrdersService, ImportOrdersRouter],
})
export class ImportOrdersModule {}
