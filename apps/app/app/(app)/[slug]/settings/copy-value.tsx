"use client";

import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { CopyIcon } from "lucide-react";
import { toast } from "sonner";

export function CopyValue({
	value,
	label,
	onCopied,
}: {
	value: string;
	label: string;
	onCopied?: () => void;
}) {
	const unavailable = () =>
		toast.error(
			`No se pudo copiar el ${label.toLowerCase()}. Selecciónalo y cópialo a mano.`,
		);

	return (
		<Button
			variant="ghost"
			size="icon"
			type="button"
			onClick={() => {
				const clipboard = navigator.clipboard;

				if (!clipboard) {
					unavailable();
					return;
				}

				clipboard
					.writeText(value)
					.then(() => {
						toast.success(`Se copió: ${label.toLowerCase()}.`);
						onCopied?.();
					})
					.catch(unavailable);
			}}
		>
			<Icon icon={CopyIcon} />
			<span className="sr-only">Copiar {label.toLowerCase()}</span>
		</Button>
	);
}
