import { redirect } from "next/navigation";
import { funnelListHref } from "@/lib/funnel-navigation";

export default async function DealsPage({
	params,
	searchParams,
}: PageProps<"/[slug]/deals">) {
	const [{ slug }, values] = await Promise.all([params, searchParams]);
	redirect(funnelListHref(slug, values));
}
