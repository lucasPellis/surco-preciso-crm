import { PageShell, PageShellLoading } from "@crm/ui/components/page-shell";
import type { Metadata } from "next";
import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { OrderView } from "./order-view";

type OrderParams = Promise<{ slug: string; orderId: string }>;

export const metadata: Metadata = {
	title: "Orden de compra",
};

export default function OrderPage({ params }: { params: OrderParams }) {
	return (
		<PageShell>
			<Suspense fallback={<PageShellLoading />}>
				<Order params={params} />
			</Suspense>
		</PageShell>
	);
}

async function Order({ params }: { params: OrderParams }) {
	await requireSession();
	const { orderId } = await params;

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await queryClient.prefetchQuery(
		trpc.importOrders.byId.queryOptions({ id: orderId }),
	);

	return (
		<HydrateClient>
			<OrderView orderId={orderId} />
		</HydrateClient>
	);
}
