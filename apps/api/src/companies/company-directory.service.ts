import { EnrichmentStatus } from "@crm/db";
import { lockIdempotencyKey } from "@crm/db/idempotency";
import { Injectable, Logger } from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { domainFromEmail } from "./domain";

@Injectable()
export class CompanyDirectoryService {
	private readonly logger = new Logger(CompanyDirectoryService.name);

	constructor(private readonly agent: AgentTriggerService) {}

	async resolveForContact(input: {
		email?: string | null;
		phone?: string | null;
		name: string;
		ownerId?: string | null;
	}): Promise<string> {
		const ownerId = input.ownerId ?? null;

		const byEmail = input.email
			? await this.companyForEmail(input.email, { ownerId })
			: null;
		if (byEmail) return byEmail;

		return this.companyForPhoneOrPerson(
			input.phone ?? null,
			input.name,
			ownerId,
		);
	}

	private async companyForPhoneOrPerson(
		phone: string | null,
		name: string,
		ownerId: string | null,
	): Promise<string> {
		const outcome = await this.agent.withCrmEvents(async (tx, emit) => {
			if (phone) {
				const matches = await tx.company.findMany({
					where: { phone, archivedAt: null },
					select: { id: true },
					take: 2,
				});
				if (matches.length === 1) {
					return { id: matches[0].id, created: false as const };
				}
			}

			const company = await tx.company.create({
				data: {
					name,
					enrichmentStatus: EnrichmentStatus.SKIPPED,
					ownerId,
				},
				select: { id: true, name: true, domain: true, createdAt: true },
			});
			await emit({
				type: "company.created",
				record: { kind: "company", id: company.id },
				occurredAt: company.createdAt,
				data: { name: company.name, domain: company.domain },
			});
			return { id: company.id, created: true as const };
		});

		this.logger.log({
			message: outcome.created
				? "Company created for a person"
				: "Company matched by phone",
			companyId: outcome.id,
		});

		return outcome.id;
	}

	async companyForEmail(
		email: string,
		options: { ownerId?: string | null } = {},
	): Promise<string | null> {
		const domain = domainFromEmail(email);
		if (!domain) return null;

		const outcome = await this.agent.withCrmEvents(async (tx, emit) => {
			await lockIdempotencyKey(tx, `company-directory:${domain}`);
			const existing = await tx.company.findFirst({
				where: { domain, archivedAt: null },
				select: { id: true },
			});
			if (existing) return { id: existing.id, created: false as const };

			const company = await tx.company.create({
				data: {
					name: domain,
					domain,
					website: `https://${domain}`,
					enrichmentStatus: EnrichmentStatus.PENDING,
					ownerId: options.ownerId ?? null,
				},
				select: { id: true, name: true, domain: true, createdAt: true },
			});
			await emit({
				type: "company.created",
				record: { kind: "company", id: company.id },
				occurredAt: company.createdAt,
				data: { name: company.name, domain: company.domain },
			});
			return { id: company.id, created: true as const };
		});
		if (!outcome.created) return outcome.id;

		await this.agent.companyCreated(
			outcome.id,
			`Created from an email domain (${domain}). It has no name but the domain`,
		);

		this.logger.log({
			message: "Company created from an email domain",
			companyId: outcome.id,
			domain,
		});

		return outcome.id;
	}
}
