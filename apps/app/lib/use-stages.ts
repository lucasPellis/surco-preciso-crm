"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { buildStageCatalog } from "@/lib/deal-stage";
import { useTRPC } from "@/lib/trpc/client";

export function useStages() {
	const trpc = useTRPC();
	const { data } = useQuery(
		trpc.deals.stages.queryOptions({ includeArchived: true }),
	);

	return useMemo(
		() => ({ ...buildStageCatalog(data ?? []), ready: data !== undefined }),
		[data],
	);
}
