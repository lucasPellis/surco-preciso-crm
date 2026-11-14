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
import { PRODUCTS_UI } from "@/lib/products-config";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { productsSearchParams } from "./products-search-params";
import { ProductsTable } from "./products-table";

export const metadata: Metadata = {
	title: PRODUCTS_UI.pageTitle,
};

export default function ProductsPage({
	searchParams,
}: PageProps<"/[slug]/products">) {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>{PRODUCTS_UI.pageTitle}</PageShellTitle>
					<PageShellDescription>
						El catálogo de equipos que importamos y vendemos.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading shape="table" />}>
					<Products searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Products({
	searchParams,
}: Pick<PageProps<"/[slug]/products">, "searchParams">) {
	const [, values] = await Promise.all([
		requireSession(),
		productsSearchParams.load(searchParams),
	]);

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await queryClient.prefetchQuery(
		trpc.products.list.queryOptions(productsSearchParams.toInput(values)),
	);

	return (
		<HydrateClient>
			<ProductsTable />
		</HydrateClient>
	);
}
