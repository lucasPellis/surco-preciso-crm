import { createListSearchParams } from "@/components/data-table/list-search-params";

export const productsSearchParams = createListSearchParams({
	defaultSort: "createdAt",
	defaultDir: "desc",
	facetIds: ["category"] as const,
});
