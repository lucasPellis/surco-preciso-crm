import {
	Controller,
	ForbiddenException,
	Get,
	Headers,
	Logger,
	Post,
	ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
	ApiExcludeEndpoint,
	ApiForbiddenResponse,
	ApiHeader,
	ApiOkResponse,
	ApiOperation,
	ApiServiceUnavailableResponse,
	ApiTags,
} from "@nestjs/swagger";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { timingSafeEquals } from "../archive/archive-retention.controller";
import type { EnvironmentVariables } from "../config/env.validation";
import { DealsService } from "./deals.service";

@ApiTags("Internal — Cron")
@ApiHeader({
	name: "authorization",
	description: "`Bearer <CRON_SECRET>`",
	required: true,
})
@ApiForbiddenResponse({ description: "CRON_SECRET did not match." })
@ApiServiceUnavailableResponse({ description: "CRON_SECRET is not set." })
@Controller("internal/deals")
export class PausedDealsController {
	private readonly logger = new Logger(PausedDealsController.name);
	private readonly secret: string | undefined;

	constructor(
		private readonly deals: DealsService,
		config: ConfigService<EnvironmentVariables, true>,
	) {
		this.secret = config.get("CRON_SECRET", { infer: true });
	}

	@Get("lose-paused")
	@AllowAnonymous()
	@ApiOperation({
		summary: "Move paused deals past their stage timeout to the lost stage",
	})
	@ApiOkResponse({ description: "The sweep ran; the per-deal counts." })
	async loseViaGet(@Headers("authorization") authorization?: string) {
		return this.run(authorization);
	}

	@Post("lose-paused")
	@AllowAnonymous()
	@ApiExcludeEndpoint()
	async loseViaPost(@Headers("authorization") authorization?: string) {
		return this.run(authorization);
	}

	private async run(authorization?: string) {
		if (!this.secret) {
			this.logger.error({
				message: "CRON_SECRET is not set — refusing to sweep paused deals.",
			});
			throw new ServiceUnavailableException("The sweep is not configured.");
		}

		if (!timingSafeEquals(authorization ?? "", `Bearer ${this.secret}`)) {
			throw new ForbiddenException();
		}

		const result = await this.deals.losePaused(new Date());

		this.logger.log({
			message: "Paused deals swept",
			lost: result.succeeded,
			skipped: result.skipped,
			failed: result.failed,
		});

		return result;
	}
}
