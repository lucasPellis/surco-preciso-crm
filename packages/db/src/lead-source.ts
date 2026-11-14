export const LEAD_SOURCE = {
	nameMaxLength: 60,
	originDetailMaxLength: 200,
} as const;

export const LEAD_SOURCE_ICONS = [
	"whatsapp",
	"facebook",
	"instagram",
	"google",
	"youtube",
	"tiktok",
	"web",
	"search",
	"referral",
	"distributor",
	"event",
	"phone",
	"mail",
	"other",
] as const;

export type LeadSourceIcon = (typeof LEAD_SOURCE_ICONS)[number];

export function isLeadSourceIcon(value: string): value is LeadSourceIcon {
	return (LEAD_SOURCE_ICONS as readonly string[]).includes(value);
}

export function leadSourceKey(name: string): string {
	return name
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}
