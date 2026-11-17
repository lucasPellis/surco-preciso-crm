import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { LeadSourcesRouter } from "./lead-sources.router";
import { LeadSourcesService } from "./lead-sources.service";

@Module({
	imports: [TrpcModule],
	providers: [LeadSourcesService, LeadSourcesRouter],
})
export class LeadSourcesModule {}
