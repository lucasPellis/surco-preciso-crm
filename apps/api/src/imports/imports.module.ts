import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { ImportStagesRouter } from "./import-stages.router";
import { ImportStagesService } from "./import-stages.service";

@Module({
	imports: [TrpcModule],
	providers: [ImportStagesService, ImportStagesRouter],
})
export class ImportsModule {}
