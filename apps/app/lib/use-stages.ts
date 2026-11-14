"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { buildStageCatalog } from "@/lib/deal-stage";
import { STAGE_LOAD_ERROR } from "@/lib/deal-stage-config";
import { useTRPC } from "@/lib/trpc/client";

export function useStages() {
	const trpc = useTRPC();
	const { data, isPending, isError, error, refetch } = useQuery(
		trpc.deals.stages.queryOptions({ includeArchived: true }),
	);

	return useMemo(() => {
		const ready = data !== undefined;

		return {
			...buildStageCatalog(data ?? []),
			ready,
			loading: isPending,
			guard: () => {
				if (ready) return true;
				if (isError) {
					toast.error(`${STAGE_LOAD_ERROR.title} ${error.message}`, {
						id: STAGE_LOAD_ERROR.toastId,
						action: {
							label: STAGE_LOAD_ERROR.retry,
							onClick: () => void refetch(),
						},
					});
				}
				return false;
			},
		};
	}, [data, isPending, isError, error, refetch]);
}
