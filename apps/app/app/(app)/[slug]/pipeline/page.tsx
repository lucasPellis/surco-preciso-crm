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
import { PipelineView } from "./pipeline-view";

export const metadata: Metadata = {
	title: "Embudo",
};

export default function PipelinePage({
	searchParams,
}: PageProps<"/[slug]/pipeline">) {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Embudo</PageShellTitle>
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
					<Pipeline searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Pipeline({
	searchParams,
}: Pick<PageProps<"/[slug]/pipeline">, "searchParams">) {
	const [, { scope }] = await Promise.all([
		requireSession(),
		loadOverviewSearchParams(searchParams),
	]);

	await getServerQueryClient().prefetchQuery(
		getServerTrpc().deals.board.queryOptions({ scope }),
	);

	return (
		<HydrateClient>
			<PipelineView />
		</HydrateClient>
	);
}
