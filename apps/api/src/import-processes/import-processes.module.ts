import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { ImportProcessesRouter } from "./import-processes.router";
import { ImportProcessesService } from "./import-processes.service";

@Module({
	imports: [TrpcModule],
	providers: [ImportProcessesService, ImportProcessesRouter],
})
export class ImportProcessesModule {}
