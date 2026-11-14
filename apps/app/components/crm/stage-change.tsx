"use client";

import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { Field, FieldLabel } from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { ChevronDownIcon } from "lucide-react";
import { parseAsString, useQueryStates } from "nuqs";
import { useId, useState } from "react";
import { toast } from "sonner";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { useStages } from "@/lib/use-stages";
import { DealStageIndicator } from "./deal-stage";

const closeReasonParams = {
	[SEARCH_PARAM.dialog.closeDeal]: parseAsString,
	[SEARCH_PARAM.dialog.closeStage]: parseAsString,
};

export function useRequestClose() {
	const [, setCloseParams] = useQueryStates(closeReasonParams);

	return (dealId: string, stage: string) =>
		void setCloseParams({
			[SEARCH_PARAM.dialog.closeDeal]: dealId,
			[SEARCH_PARAM.dialog.closeStage]: stage,
		});
}

export function useStageMutation(onDone?: () => void) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	return useMutation(
		trpc.deals.setStage.mutationOptions({
			onSuccess: async (_, variables) => {
				await cache.deal(variables.id);
				onDone?.();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
}

export function DealStageMenu({
	dealId,
	stage,
	variant = "inline",
}: {
	dealId: string;
	stage: string;
	variant?: "inline" | "control";
}) {
	const [, setCloseParams] = useQueryStates(closeReasonParams);
	const setStage = useStageMutation();
	const stages = useStages();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				{variant === "control" ? (
					<Button
						variant="outline"
						size="sm"
						disabled={setStage.isPending || !stages.ready}
						onClick={(event) => event.stopPropagation()}
					>
						<DealStageIndicator stage={stage} className="text-foreground" />
						<Icon icon={ChevronDownIcon} className="text-muted-foreground" />
					</Button>
				) : (
					<button
						type="button"
						onClick={(event) => event.stopPropagation()}
						disabled={setStage.isPending || !stages.ready}
						className="flex max-w-full min-w-0 items-center text-left hover:text-foreground disabled:opacity-50"
					>
						<DealStageIndicator stage={stage} />
					</button>
				)}
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align={variant === "control" ? "end" : "start"}
				className="min-w-52"
				onClick={(event) => event.stopPropagation()}
			>
				<DropdownMenuRadioGroup
					value={stage}
					onValueChange={(next) => {
						const chosen = next;
						if (!stages.ready || chosen === stage) return;
						if (stages.isLosing(chosen)) {
							void setCloseParams({
								[SEARCH_PARAM.dialog.closeDeal]: dealId,
								[SEARCH_PARAM.dialog.closeStage]: chosen,
							});
							return;
						}
						setStage.mutate({ id: dealId, stage: chosen });
					}}
				>
					{stages.options.map((option) => (
						<DropdownMenuRadioItem key={option.value} value={option.value}>
							{option.label}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function CloseReasonDialog() {
	const reasonId = useId();
	const [closeValues, setCloseParams] = useQueryStates(closeReasonParams);
	const closing = closeValues[SEARCH_PARAM.dialog.closeDeal];
	const closingStage = closeValues[SEARCH_PARAM.dialog.closeStage];
	const [reason, setReason] = useState("");

	const close = () => {
		setReason("");
		void setCloseParams({
			[SEARCH_PARAM.dialog.closeDeal]: null,
			[SEARCH_PARAM.dialog.closeStage]: null,
		});
	};

	const setStage = useStageMutation(() => {
		toast.success("Oportunidad marcada como perdida.");
		close();
	});

	const stage = closingStage;
	const open = Boolean(closing && stage);

	return (
		<Dialog open={open} onOpenChange={(next) => !next && close()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Marcar como perdido</DialogTitle>
					<DialogDescription>
						¿Por qué se perdió? Es el único lugar donde queda registrado el
						motivo, y aparece en la línea de tiempo.
					</DialogDescription>
				</DialogHeader>

				<form
					id="close-reason"
					className="px-4"
					onSubmit={(event) => {
						event.preventDefault();
						if (!closing || !stage) return;
						setStage.mutate({ id: closing, stage, closedReason: reason });
					}}
				>
					<Field>
						<FieldLabel htmlFor={reasonId}>Motivo</FieldLabel>
						<Textarea
							id={reasonId}
							value={reason}
							onChange={(event) => setReason(event.target.value)}
							placeholder="Eligió a otro proveedor"
							rows={3}
						/>
					</Field>
				</form>

				<DialogFooter>
					<Button
						type="submit"
						form="close-reason"
						disabled={setStage.isPending || reason.trim() === ""}
					>
						{setStage.isPending ? <Spinner /> : null}
						Guardar
					</Button>
					<Button variant="outline" onClick={close}>
						Cancelar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
