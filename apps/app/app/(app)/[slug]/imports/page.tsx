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
import { IMPORTS_UI } from "@/lib/imports-config";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { importsSearchParams } from "./imports-search-params";
import { OrdersTable } from "./orders-table";

export const metadata: Metadata = {
	title: IMPORTS_UI.pageTitle,
};

export default function ImportsPage({
	searchParams,
}: PageProps<"/[slug]/imports">) {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>{IMPORTS_UI.pageTitle}</PageShellTitle>
					<PageShellDescription>
						Las órdenes de compra a proveedores, sus envíos por etapa y los días
						entre etapas.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading shape="table" />}>
					<Orders searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Orders({
	searchParams,
}: Pick<PageProps<"/[slug]/imports">, "searchParams">) {
	const [, values] = await Promise.all([
		requireSession(),
		importsSearchParams.load(searchParams),
	]);

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await queryClient.prefetchQuery(
		trpc.importOrders.list.queryOptions(importsSearchParams.toInput(values)),
	);

	return (
		<HydrateClient>
			<OrdersTable />
		</HydrateClient>
	);
}
