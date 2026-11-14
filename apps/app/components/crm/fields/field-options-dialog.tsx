"use client";

import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@crm/ui/components/dialog";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { SortableItem, SortableList } from "@crm/ui/components/sortable-list";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@crm/ui/components/tooltip";
import { useMutation } from "@tanstack/react-query";
import { PencilIcon, PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	addOption,
	cleanOptions,
	hasDuplicates,
	hasLabel,
	type OptionDraft,
	optionsChanged,
	removeOption,
	renameOption,
} from "@/lib/field-options";
import { FIELD_OPTIONS } from "@/lib/field-options-config";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

function draftId(option: OptionDraft, index: number): string {
	return option.id ?? `draft-${index}`;
}

export function FieldOptionsDialog({
	fieldId,
	options,
}: {
	fieldId: string;
	options: OptionDraft[];
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState<OptionDraft[]>(options);
	const [fresh, setFresh] = useState("");

	const update = useMutation(
		trpc.fields.update.mutationOptions({
			onSuccess: async () => {
				await cache.fields();
				setOpen(false);
			},
			onError: (error) => toast.error(error.message || FIELD_OPTIONS.failed),
		}),
	);

	const duplicate = fresh.trim() !== "" && hasLabel(draft, fresh);
	const cleaned = cleanOptions(draft);
	const blocked =
		cleaned.length === 0 ||
		hasDuplicates(draft) ||
		!optionsChanged(options, cleaned);

	const add = () => {
		if (!fresh.trim() || duplicate) return;
		setDraft(addOption(draft, fresh));
		setFresh("");
	};

	const onOpenChange = (next: boolean) => {
		if (next) {
			setDraft(options);
			setFresh("");
		}
		setOpen(next);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<Tooltip>
				<TooltipTrigger asChild>
					<DialogTrigger asChild>
						<Button variant="ghost" size="icon-xs">
							<Icon icon={PencilIcon} />
							<span className="sr-only">{FIELD_OPTIONS.trigger}</span>
						</Button>
					</DialogTrigger>
				</TooltipTrigger>
				<TooltipContent>{FIELD_OPTIONS.trigger}</TooltipContent>
			</Tooltip>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{FIELD_OPTIONS.title}</DialogTitle>
					<DialogDescription>{FIELD_OPTIONS.description}</DialogDescription>
				</DialogHeader>
				<SortableList
					ids={draft.map(draftId)}
					onReorder={(ids) =>
						setDraft(
							ids
								.map((id) =>
									draft.find((option, at) => draftId(option, at) === id),
								)
								.filter((option): option is OptionDraft => Boolean(option)),
						)
					}
				>
					<div className="flex flex-col gap-1.5">
						{draft.map((option, index) => (
							<SortableItem
								key={draftId(option, index)}
								id={draftId(option, index)}
								label={option.label || FIELD_OPTIONS.optionLabel(index)}
							>
								<Input
									aria-label={FIELD_OPTIONS.optionLabel(index)}
									value={option.label}
									onChange={(event) =>
										setDraft(renameOption(draft, index, event.target.value))
									}
								/>
								<Button
									variant="ghost"
									size="icon-xs"
									onClick={() => setDraft(removeOption(draft, index))}
								>
									<Icon icon={XIcon} />
									<span className="sr-only">
										{FIELD_OPTIONS.remove(
											option.label || FIELD_OPTIONS.optionLabel(index),
										)}
									</span>
								</Button>
							</SortableItem>
						))}
					</div>
				</SortableList>
				<div className="flex items-center gap-1.5">
					<Input
						aria-label={FIELD_OPTIONS.addPlaceholder}
						placeholder={FIELD_OPTIONS.addPlaceholder}
						value={fresh}
						aria-invalid={duplicate}
						onChange={(event) => setFresh(event.target.value)}
						onKeyDown={(event) => {
							if (event.key !== "Enter") return;
							event.preventDefault();
							add();
						}}
					/>
					<Button
						variant="ghost"
						size="sm"
						disabled={!fresh.trim() || duplicate}
						onClick={add}
					>
						<Icon icon={PlusIcon} data-icon="inline-start" />
						{FIELD_OPTIONS.add}
					</Button>
				</div>
				<p className="text-13 text-muted-foreground">
					{duplicate ? FIELD_OPTIONS.duplicate : FIELD_OPTIONS.removeHint}
				</p>
				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)}>
						{FIELD_OPTIONS.cancel}
					</Button>
					<Button
						disabled={blocked || update.isPending}
						onClick={() =>
							update.mutate({ id: fieldId, data: { options: cleaned } })
						}
					>
						{FIELD_OPTIONS.save}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
