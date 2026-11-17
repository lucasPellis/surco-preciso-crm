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
import { OrderForm } from "../order-form";

export const metadata: Metadata = {
	title: "Nueva orden de compra",
};

export default function NewOrderPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Nueva orden de compra</PageShellTitle>
					<PageShellDescription>
						El número de la orden se asigna al crearla. Después de crearla, la
						orden se sigue envío por envío.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<NewOrder />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function NewOrder() {
	await requireSession();

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await queryClient.prefetchQuery(trpc.importOrders.options.queryOptions());

	return (
		<HydrateClient>
			<OrderForm order={null} />
		</HydrateClient>
	);
}
