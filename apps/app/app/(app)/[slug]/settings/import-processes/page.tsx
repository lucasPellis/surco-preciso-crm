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
import { ImportProcessesSettings } from "./import-processes-settings";

export const metadata: Metadata = {
	title: "Procesos de importación",
};

export default function ImportProcessesSettingsPage() {
	return (
		<PageShell width="narrow">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Procesos de importación</PageShellTitle>
					<PageShellDescription>
						Un proceso es la lista de etapas que sigue un envío, por ejemplo
						según el país de destino o el transporte. Cada orden elige su
						proceso.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading shape="settings" />}>
					<Processes />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Processes() {
	await requireSession();

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	await queryClient.prefetchQuery(trpc.importProcesses.list.queryOptions());

	return (
		<HydrateClient>
			<ImportProcessesSettings />
		</HydrateClient>
	);
}
