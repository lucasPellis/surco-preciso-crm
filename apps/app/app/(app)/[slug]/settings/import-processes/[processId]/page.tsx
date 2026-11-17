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

type ProcessParams = Promise<{ slug: string; processId: string }>;

export const metadata: Metadata = {
	title: "Etapas del proceso",
};

export default function ImportProcessStagesPage({
	params,
}: {
	params: ProcessParams;
}) {
	return (
		<PageShell width="narrow">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Etapas del proceso</PageShellTitle>
					<PageShellDescription>
						Las etapas por las que pasa un envío de este proceso. Cambia
						nombres, orden y color, o agrega etapas intermedias. La primera
						etapa y las de recepción y cancelación son fijas y solo se
						renombran.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading shape="settings" />}>
					<Stages params={params} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Stages({ params }: { params: ProcessParams }) {
	await requireSession();
	const { processId } = await params;

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	await queryClient.prefetchQuery(
		trpc.importStages.settings.queryOptions({ processId }),
	);

	return (
		<HydrateClient>
			<ImportStagesSettings processId={processId} />
		</HydrateClient>
	);
}
