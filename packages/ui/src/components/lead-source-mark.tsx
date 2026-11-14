import { isLeadSourceIcon, type LeadSourceIcon } from "@crm/db/lead-source";
import { cn } from "@crm/ui/lib/utils";
import {
	CalendarDaysIcon,
	GlobeIcon,
	type LucideIcon,
	MailIcon,
	PhoneIcon,
	SearchIcon,
	StoreIcon,
	TagIcon,
	UsersIcon,
} from "lucide-react";
import {
	siFacebook,
	siGoogleads,
	siInstagram,
	siTiktok,
	siWhatsapp,
	siYoutube,
} from "simple-icons";

const BRANDS = {
	whatsapp: siWhatsapp,
	facebook: siFacebook,
	instagram: siInstagram,
	google: siGoogleads,
	youtube: siYoutube,
	tiktok: siTiktok,
} as const;

type BrandIcon = keyof typeof BRANDS;

const GLYPHS: Record<Exclude<LeadSourceIcon, BrandIcon>, LucideIcon> = {
	web: GlobeIcon,
	search: SearchIcon,
	referral: UsersIcon,
	distributor: StoreIcon,
	event: CalendarDaysIcon,
	phone: PhoneIcon,
	mail: MailIcon,
	other: TagIcon,
};

export const LEAD_SOURCE_ICON_LABELS: Record<LeadSourceIcon, string> = {
	whatsapp: "WhatsApp",
	facebook: "Facebook",
	instagram: "Instagram",
	google: "Google",
	youtube: "YouTube",
	tiktok: "TikTok",
	web: "Sitio web",
	search: "Búsqueda",
	referral: "Referido",
	distributor: "Distribuidor",
	event: "Feria o evento",
	phone: "Teléfono",
	mail: "Email",
	other: "Otro",
};

function isBrand(icon: LeadSourceIcon): icon is BrandIcon {
	return icon in BRANDS;
}

export function LeadSourceMark({
	icon,
	className,
}: {
	icon: string | null;
	className?: string;
}) {
	const key: LeadSourceIcon = icon && isLeadSourceIcon(icon) ? icon : "other";

	if (isBrand(key)) {
		const brand = BRANDS[key];
		return (
			<svg
				aria-hidden="true"
				className={cn(
					"size-4 shrink-0",
					brand.hex === "000000" && "dark:invert",
					className,
				)}
				style={{ color: `#${brand.hex}` }}
				viewBox="0 0 24 24"
			>
				<path d={brand.path} fill="currentColor" />
			</svg>
		);
	}

	const Glyph = GLYPHS[key];
	return (
		<Glyph
			aria-hidden="true"
			className={cn("size-4 shrink-0 text-muted-foreground", className)}
		/>
	);
}
