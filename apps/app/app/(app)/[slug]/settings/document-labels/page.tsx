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
import { DocumentLabelsSettings } from "./document-labels-settings";

export const metadata: Metadata = {
	title: "Etiquetas de documentos",
};

export default function DocumentLabelsSettingsPage() {
	return (
		<PageShell width="narrow">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Etiquetas de documentos</PageShellTitle>
					<PageShellDescription>
						Una etiqueta dice qué es un documento, por ejemplo Packing list.
						Cada etapa de un proceso puede esperar algunas etiquetas.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading shape="settings" />}>
					<Labels />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Labels() {
	await requireSession();

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	await queryClient.prefetchQuery(trpc.documentLabels.list.queryOptions());

	return (
		<HydrateClient>
			<DocumentLabelsSettings />
		</HydrateClient>
	);
}
