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
import { EditOrderForm } from "../../order-form";

type OrderParams = Promise<{ slug: string; orderId: string }>;

export const metadata: Metadata = {
	title: "Editar orden de compra",
};

export default function EditOrderPage({ params }: { params: OrderParams }) {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Editar orden de compra</PageShellTitle>
					<PageShellDescription>
						Los cambios valen para los datos y las líneas. Los envíos no
						cambian.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<EditOrder params={params} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function EditOrder({ params }: { params: OrderParams }) {
	await requireSession();
	const { orderId } = await params;

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await Promise.all([
		queryClient.prefetchQuery(
			trpc.importOrders.byId.queryOptions({ id: orderId }),
		),
		queryClient.prefetchQuery(trpc.importOrders.options.queryOptions()),
	]);

	return (
		<HydrateClient>
			<EditOrderForm orderId={orderId} />
		</HydrateClient>
	);
}
