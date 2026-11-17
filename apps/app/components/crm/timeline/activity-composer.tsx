"use client";

import { Calendar as DayPicker } from "@crm/ui/components/calendar";
import { Icon } from "@crm/ui/components/icon";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@crm/ui/components/input-group";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@crm/ui/components/popover";
import { Spinner } from "@crm/ui/components/spinner";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { toDay } from "@crm/ui/lib/format";
import { useMutation } from "@tanstack/react-query";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { activityLabel } from "@/lib/activity-presentation";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { ActivityIcon } from "./activity-icon";
import type { TimelineAnchor } from "./timeline";

const TYPES = ["NOTE", "CALL", "EMAIL", "MEETING", "TASK"] as const;

type ComposableType = (typeof TYPES)[number];

const dueFormat = new Intl.DateTimeFormat("es", {
	month: "short",
	day: "numeric",
});

const PLACEHOLDER = {
	NOTE: "Registra una nota, llamada, correo, reunión o tarea…",
	CALL: "¿Qué salió de la llamada?",
	EMAIL: "¿Qué se dijo?",
	MEETING: "¿Qué salió de la reunión?",
	TASK: "¿Qué hay que hacer?",
} satisfies Record<ComposableType, string>;

export function ActivityComposer({
	anchor,
	fixedType,
}: {
	anchor: TimelineAnchor;
	fixedType?: ComposableType;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const [type, setType] = useState<ComposableType>(fixedType ?? "NOTE");
	const [draft, setDraft] = useState("");
	const [dueAt, setDueAt] = useState<Date | undefined>(undefined);

	const isTask = type === "TASK";
	const text = draft.trim();

	const reset = () => {
		setDraft("");
		setDueAt(undefined);
	};

	const create = useMutation(
		trpc.activities.create.mutationOptions({
			onSuccess: async () => {
				await cache.activity();
				reset();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const submit = () => {
		if (text === "" || create.isPending) return;
		create.mutate({
			...anchor,
			type,
			subject: isTask ? text : undefined,
			body: isTask ? undefined : text,
			dueAt: isTask ? (dueAt ? toDay(dueAt) : null) : undefined,
		});
	};

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				submit();
			}}
		>
			<InputGroup>
				<InputGroupTextarea
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					placeholder={PLACEHOLDER[type]}
					aria-label="Qué pasó"
					onKeyDown={(event) => {
						if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
							event.preventDefault();
							submit();
						}
						if (event.key === "Escape") reset();
					}}
				/>

				<InputGroupAddon align="block-end" className="gap-3 border-t">
					{fixedType ? null : (
						<ToggleGroup
							type="single"
							value={type}
							onValueChange={(next) => next && setType(next as ComposableType)}
							size="sm"
							spacing={1}
						>
							{TYPES.map((option) => (
								<ToggleGroupItem
									key={option}
									value={option}
									aria-label={activityLabel(option)}
								>
									<ActivityIcon type={option} />
									{activityLabel(option)}
								</ToggleGroupItem>
							))}
						</ToggleGroup>
					)}

					{isTask ? (
						<Popover>
							<PopoverTrigger asChild>
								<InputGroupButton variant="ghost" size="xs">
									<Icon icon={CalendarIcon} data-icon="inline-start" />
									{dueAt ? dueFormat.format(dueAt) : "Fecha límite"}
								</InputGroupButton>
							</PopoverTrigger>
							<PopoverContent size="fit" align="start">
								<DayPicker
									mode="single"
									selected={dueAt}
									onSelect={setDueAt}
									autoFocus
								/>
							</PopoverContent>
						</Popover>
					) : null}

					{text === "" ? null : (
						<InputGroupButton
							type="submit"
							variant="default"
							size="xs"
							className="ml-auto"
							disabled={create.isPending}
						>
							{create.isPending ? <Spinner /> : null}
							{isTask
								? "Agregar tarea"
								: `Registrar ${activityLabel(type).toLowerCase()}`}
						</InputGroupButton>
					)}
				</InputGroupAddon>
			</InputGroup>
		</form>
	);
}
