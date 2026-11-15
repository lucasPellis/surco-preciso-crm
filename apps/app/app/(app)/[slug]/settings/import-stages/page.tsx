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
import { ImportStagesSettings } from "./import-stages-settings";

export const metadata: Metadata = {
	title: "Etapas de importación",
};

export default function ImportStagesSettingsPage() {
	return (
		<PageShell width="narrow">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Etapas de importación</PageShellTitle>
					<PageShellDescription>
						Las etapas por las que pasa un envío. Cambia nombres, orden y color,
						o agrega etapas intermedias. Pedido, Recibido y Cancelado son fijas
						y solo se renombran.
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

	await queryClient.prefetchQuery(trpc.importStages.settings.queryOptions());

	return (
		<HydrateClient>
			<ImportStagesSettings />
		</HydrateClient>
	);
}
