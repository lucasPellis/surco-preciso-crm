import { LEAD_SOURCE, LEAD_SOURCE_ICONS } from "@crm/db/lead-source";
import { z } from "zod";

const sourceName = z
	.string()
	.trim()
	.min(1, "A source needs a name.")
	.max(
		LEAD_SOURCE.nameMaxLength,
		`A name has at most ${LEAD_SOURCE.nameMaxLength} characters.`,
	);

const sourceIcon = z.enum(LEAD_SOURCE_ICONS);

export const createLeadSourceInput = z.object({
	name: sourceName,
	icon: sourceIcon.nullable().optional(),
});

export const updateLeadSourceInput = z.object({
	id: z.string().min(1),
	name: sourceName,
	icon: sourceIcon.nullable(),
});

export const leadSourceIdInput = z.object({ id: z.string().min(1) });

export const reorderLeadSourcesInput = z.object({
	ids: z.array(z.string().min(1)).min(1),
});

export type CreateLeadSourceInput = z.infer<typeof createLeadSourceInput>;
export type UpdateLeadSourceInput = z.infer<typeof updateLeadSourceInput>;
export type LeadSourceIdInput = z.infer<typeof leadSourceIdInput>;
export type ReorderLeadSourcesInput = z.infer<typeof reorderLeadSourcesInput>;

export const leadSourceOutput = z.object({
	id: z.string(),
	key: z.string(),
	name: z.string(),
	icon: z.string().nullable(),
	archived: z.boolean(),
	contacts: z.number(),
});

export const leadSourceListOutput = z.object({
	sources: z.array(leadSourceOutput),
	canManage: z.boolean(),
});

export type LeadSourceRow = z.infer<typeof leadSourceOutput>;
export type LeadSourceList = z.infer<typeof leadSourceListOutput>;
