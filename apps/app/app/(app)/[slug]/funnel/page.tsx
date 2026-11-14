import {
	PageShell,
	PageShellActions,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
	PageShellTitle,
} from "@crm/ui/components/page-shell";
import type { Metadata } from "next";
import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { CreateContactSheet } from "../contacts/create-contact-sheet";
import {
	OverviewScopeToggle,
	OverviewScopeToggleFallback,
} from "../overview-scope";
import { loadOverviewSearchParams } from "../overview-search-params";
import { FunnelView } from "./funnel-view";

export const metadata: Metadata = {
	title: "Funnel",
};

export default function FunnelPage({
	searchParams,
}: PageProps<"/[slug]/funnel">) {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Funnel</PageShellTitle>
					<PageShellDescription>
						Las oportunidades abiertas por etapa. Arrastra una tarjeta para
						cambiarla de etapa.
					</PageShellDescription>
				</PageShellHeading>
				<PageShellActions>
					<Suspense fallback={<OverviewScopeToggleFallback />}>
						<OverviewScopeToggle />
					</Suspense>
					<CreateContactSheet lead />
				</PageShellActions>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading shape="table" />}>
					<Funnel searchParams={searchParams} />
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
