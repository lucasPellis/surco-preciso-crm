"use client";

import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { parseAsStringLiteral, useQueryState } from "nuqs";

const VIEWS = ["board", "list"] as const;

export function FunnelViewToggle() {
	const [view, setView] = useQueryState(
		"view",
		parseAsStringLiteral(VIEWS)
			.withDefault("board")
			.withOptions({ shallow: false, history: "push" }),
	);

	return (
		<ToggleGroup
			type="single"
			variant="outline"
			size="sm"
			spacing={0}
			value={view}
			onValueChange={(next) => {
				if (next === "board" || next === "list") void setView(next);
			}}
			aria-label="Vista del funnel"
		>
			<ToggleGroupItem value="board">Columnas</ToggleGroupItem>
			<ToggleGroupItem value="list">Lista</ToggleGroupItem>
		</ToggleGroup>
	);
}
