import type { ActivityType } from "@crm/db/enums";
import type { IconComponent } from "@crm/ui/components/icon";
import {
	ArrowRightIcon,
	CalendarDaysIcon,
	MailIcon,
	MessageSquareIcon,
	PhoneIcon,
	SquareCheckIcon,
	WandSparklesIcon,
} from "lucide-react";

type ActivityPresentation = Record<
	ActivityType,
	{ icon: IconComponent; label: string }
>;

const PRESENTATION: ActivityPresentation = {
	NOTE: { icon: MessageSquareIcon, label: "Nota" },
	CALL: { icon: PhoneIcon, label: "Llamada" },
	EMAIL: { icon: MailIcon, label: "Correo" },
	MEETING: { icon: CalendarDaysIcon, label: "Reunión" },
	TASK: { icon: SquareCheckIcon, label: "Tarea" },
	STAGE_CHANGE: { icon: ArrowRightIcon, label: "Cambio de etapa" },
	ENRICHMENT: { icon: WandSparklesIcon, label: "Enriquecimiento" },
};

export function activityLabel(type: ActivityType): string {
	return PRESENTATION[type].label;
}

export function activityIcon(type: ActivityType): IconComponent {
	return PRESENTATION[type].icon;
}
