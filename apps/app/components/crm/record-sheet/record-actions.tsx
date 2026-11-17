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
import { Button } from "@crm/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { Icon } from "@crm/ui/components/icon";
import { useMutation } from "@tanstack/react-query";
import {
	ArchiveIcon,
	EllipsisVerticalIcon,
	Trash2Icon,
	Undo2Icon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import {
	type RecordKind,
	type RecordRef,
	useRecordStack,
} from "./record-stack";

const NOUN = {
	company: "empresa",
	contact: "contacto",
	deal: "oportunidad",
} satisfies Record<RecordKind, string>;

const RECORD_PROCEDURES = {
	company: "companies",
	contact: "contacts",
	deal: "deals",
} satisfies Record<RecordKind, "companies" | "contacts" | "deals">;

function useArchiveRecord(record: RecordRef) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const handlers = {
		onSuccess: (archived: { name: string }) => {
			toast.success(`Archivado: ${archived.name || NOUN[record.kind]}.`);
			void cache[record.kind](record.id);
		},
		onError: (error: { message: string }) => toast.error(error.message),
	};

	return useMutation(
		trpc[RECORD_PROCEDURES[record.kind]].archive.mutationOptions(handlers),
	);
}

function useRestoreRecord(record: RecordRef) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const handlers = {
		onSuccess: (restored: { name: string }) => {
			toast.success(`Restaurado: ${restored.name || NOUN[record.kind]}.`);
			void cache[record.kind](record.id);
		},
		onError: (error: { message: string }) => toast.error(error.message),
	};

	return useMutation(
		trpc[RECORD_PROCEDURES[record.kind]].restore.mutationOptions(handlers),
	);
}

function usePurgeRecord(record: RecordRef) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const { close } = useRecordStack();

	const handlers = {
		onSuccess: (purged: { name: string }) => {
			toast.success(
				`Eliminado para siempre: ${purged.name || NOUN[record.kind]}.`,
			);
			void cache.removed(record);
			close();
		},
		onError: (error: { message: string }) => toast.error(error.message),
	};

	return useMutation(
		trpc[RECORD_PROCEDURES[record.kind]].purge.mutationOptions(handlers),
	);
}

export function RecordActions({
	record,
	name,
	consequence,
	archivedAt,
}: {
	record: RecordRef;
	name: string;
	consequence: string;
	archivedAt: string | null;
}) {
	const [confirming, setConfirming] = useState(false);
	const archive = useArchiveRecord(record);
	const restore = useRestoreRecord(record);
	const purge = usePurgeRecord(record);

	const pending = archive.isPending || restore.isPending || purge.isPending;

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="icon-sm" disabled={pending}>
						<Icon icon={EllipsisVerticalIcon} />
						<span className="sr-only">Más acciones</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="min-w-44">
					{archivedAt ? (
						<>
							<DropdownMenuItem
								onSelect={() => restore.mutate({ id: record.id })}
							>
								<Icon icon={Undo2Icon} />
								Restaurar {NOUN[record.kind]}
							</DropdownMenuItem>
							<DropdownMenuItem
								variant="destructive"
								onSelect={() => setConfirming(true)}
							>
								<Icon icon={Trash2Icon} />
								Eliminar {NOUN[record.kind]} para siempre
							</DropdownMenuItem>
						</>
					) : (
						<DropdownMenuItem
							onSelect={() => archive.mutate({ id: record.id })}
						>
							<Icon icon={ArchiveIcon} />
							Archivar {NOUN[record.kind]}
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>

			<AlertDialog open={confirming} onOpenChange={setConfirming}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>¿Eliminar {name} para siempre?</AlertDialogTitle>
						<AlertDialogDescription>{consequence}</AlertDialogDescription>
					</AlertDialogHeader>

					<AlertDialogFooter>
						<AlertDialogCancel>Cancelar</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={() => purge.mutate({ id: record.id })}
						>
							Eliminar para siempre
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
