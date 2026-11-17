import type { Prisma } from "@crm/db";

export async function claimPrimaryContact(
	tx: Prisma.TransactionClient,
	companyId: string,
	contactId: string,
): Promise<void> {
	await tx.$executeRaw`
		UPDATE company
		SET "primaryContactId" = ${contactId}
		WHERE id = ${companyId}
			AND "primaryContactId" IS NULL
			AND NOT EXISTS (
				SELECT 1 FROM company AS other WHERE other."primaryContactId" = ${contactId}
			)
	`;
}
