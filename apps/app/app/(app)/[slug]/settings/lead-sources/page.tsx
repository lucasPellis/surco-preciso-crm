import {
	PageShell,
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
import { LeadSourcesSettings } from "./lead-sources-settings";

export const metadata: Metadata = {
	title: "Orígenes",
};

export default function LeadSourcesSettingsPage() {
	return (
		<PageShell width="narrow">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Orígenes</PageShellTitle>
					<PageShellDescription>
						De dónde llegan tus contactos. Cada contacto tiene un origen, y los
						reportes se agrupan por origen.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading shape="settings" />}>
					<LeadSources />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function LeadSources() {
	await requireSession();

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	await queryClient.prefetchQuery(trpc.leadSources.list.queryOptions());

	return (
		<HydrateClient>
			<LeadSourcesSettings />
		</HydrateClient>
	);
}
