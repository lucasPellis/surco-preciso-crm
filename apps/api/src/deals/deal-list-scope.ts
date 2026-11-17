import type { Prisma } from "@crm/db";

export function dealListScopeFilter(
	scope: "me" | "everyone" | undefined,
	userId: string | undefined,
): Prisma.DealWhereInput {
	if (scope !== "me") return {};
	if (!userId) throw new Error("A user is required for the me scope.");
	return { ownerId: userId };
}
