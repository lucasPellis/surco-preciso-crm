import {
	PageShell,
	PageShellActions,
	PageShellContent,
	PageShellHeader,
	PageShellLoading,
} from "@crm/ui/components/page-shell";
import type { Metadata } from "next";
import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { CreateLeadSheet } from "../contacts/create-lead-sheet";
import { DealsView } from "../deals/deals-view";
import {
	OverviewScopeToggle,
	OverviewScopeToggleFallback,
} from "../overview-scope";
import { loadOverviewSearchParams } from "../overview-search-params";
import { FunnelView } from "./funnel-view";
import { FunnelViewToggle } from "./funnel-view-toggle";

export const metadata: Metadata = {
	title: "Funnel",
};

export default async function FunnelPage({
	searchParams,
}: PageProps<"/[slug]/funnel">) {
	const values = await searchParams;
	const list = values.view === "list";
	return (
		<PageShell className="min-h-0" contained={!list}>
			<PageShellHeader>
				<Suspense>
					<FunnelViewToggle />
				</Suspense>
				<PageShellActions>
					<Suspense fallback={<OverviewScopeToggleFallback />}>
						<OverviewScopeToggle />
					</Suspense>
					<CreateLeadSheet />
				</PageShellActions>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading shape="table" />}>
					{list ? (
						<DealsView searchParams={searchParams} />
					) : (
						<Funnel searchParams={searchParams} />
					)}
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Funnel({
	searchParams,
}: Pick<PageProps<"/[slug]/funnel">, "searchParams">) {
	const [, { scope }] = await Promise.all([
		requireSession(),
		loadOverviewSearchParams(searchParams),
	]);

	await getServerQueryClient().prefetchQuery(
		getServerTrpc().deals.board.queryOptions({ scope }),
	);

	return (
		<HydrateClient>
			<FunnelView />
		</HydrateClient>
	);
}
