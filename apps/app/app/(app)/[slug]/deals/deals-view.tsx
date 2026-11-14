import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { loadOverviewSearchParams } from "../overview-search-params";
import { dealsSearchParams } from "./deals-search-params";
import { DealsTable } from "./deals-table";

export async function DealsView({
	searchParams,
}: Pick<PageProps<"/[slug]/funnel">, "searchParams">) {
	const [, values, { scope }] = await Promise.all([
		requireSession(),
		dealsSearchParams.load(searchParams),
		loadOverviewSearchParams(searchParams),
	]);
	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await Promise.all([
		queryClient.prefetchQuery(
			trpc.deals.list.queryOptions({
				...dealsSearchParams.toInput(values),
				scope,
			}),
		),
		queryClient.prefetchQuery(trpc.users.list.queryOptions()),
		queryClient.prefetchQuery(trpc.companies.options.queryOptions({ q: "" })),
	]);
	return (
		<HydrateClient>
			<DealsTable />
		</HydrateClient>
	);
}
