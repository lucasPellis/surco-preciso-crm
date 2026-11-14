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
import { StagesSettings } from "./stages-settings";

export const metadata: Metadata = {
	title: "Etapas",
};

export default function StagesSettingsPage() {
	return (
		<PageShell width="narrow">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Etapas</PageShellTitle>
					<PageShellDescription>
						Las etapas del funnel. Cambia nombres, orden y color, o agrega
						etapas intermedias. Nuevo, Ganado y Perdido son fijas y solo se
						renombran.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading shape="settings" />}>
					<Stages />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Stages() {
	await requireSession();

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	await queryClient.prefetchQuery(trpc.deals.stageList.queryOptions());

	return (
		<HydrateClient>
			<StagesSettings />
		</HydrateClient>
	);
}
