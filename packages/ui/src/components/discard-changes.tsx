"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@crm/ui/components/alert-dialog";
import { useRef, useState } from "react";

type DiscardWording = {
	title: string;
	description: string;
	confirmLabel: string;
	keepLabel: string;
};

function useDiscardChanges({
	open,
	dirty,
	pending = false,
	onOpenChange,
	onDiscard,
	wording = {
		title: "¿Descartar los cambios?",
		description: "Los cambios no se guardaron. ¿Descartarlos y cerrar?",
		confirmLabel: "Descartar",
		keepLabel: "Seguir editando",
	},
}: {
	open: boolean;
	dirty: boolean;
	pending?: boolean;
	onOpenChange: (open: boolean) => void;
	onDiscard?: () => void;
	wording?: DiscardWording;
}) {
	const [asking, setAsking] = useState(false);
	const returnFocus = useRef<HTMLElement | null>(null);

	const discard = () => {
		if (pending) return;
		setAsking(false);
		returnFocus.current = null;
		onDiscard?.();
		onOpenChange(false);
	};

	const changeOpen = (next: boolean) => {
		if (!next && pending) return;
		if (!next && dirty) {
			returnFocus.current =
				document.activeElement instanceof HTMLElement
					? document.activeElement
					: null;
			setAsking(true);
			return;
		}
		setAsking(false);
		onOpenChange(next);
	};

	const dialog = (
		<AlertDialog open={open && asking} onOpenChange={setAsking}>
			<AlertDialogContent
				onCloseAutoFocus={(event) => {
					if (!asking && open && returnFocus.current?.isConnected) {
						event.preventDefault();
						returnFocus.current.focus();
						returnFocus.current = null;
					}
				}}
			>
				<AlertDialogHeader>
					<AlertDialogTitle>{wording.title}</AlertDialogTitle>
					<AlertDialogDescription>{wording.description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{wording.keepLabel}</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						disabled={pending}
						onClick={discard}
					>
						{wording.confirmLabel}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);

	return { onOpenChange: changeOpen, discard, dialog };
}

export { type DiscardWording, useDiscardChanges };
