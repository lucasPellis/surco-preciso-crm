"use client";

import { LeadSourceMark } from "@crm/ui/components/lead-source-mark";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { CheckIcon } from "lucide-react";

export type LeadSourceOption = {
	id: string;
	name: string;
	icon: string | null;
};

export function LeadSourcePicker({
	sources,
	value,
	onValueChange,
	label,
}: {
	sources: LeadSourceOption[];
	value: string;
	onValueChange: (value: string) => void;
	label: string;
}) {
	return (
		<ToggleGroup
			type="single"
			variant="outline"
			size="sm"
			spacing={1}
			value={value}
			onValueChange={onValueChange}
			aria-label={label}
			className="w-full flex-wrap"
		>
			{sources.map((source) => (
				<ToggleGroupItem
					key={source.id}
					value={source.id}
					className="data-[state=on]:border-brand/60 data-[state=on]:bg-brand/5 dark:data-[state=on]:bg-brand/10"
				>
					<LeadSourceMark icon={source.icon} />
					{source.name}
					{value === source.id ? <CheckIcon className="text-brand" /> : null}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}
