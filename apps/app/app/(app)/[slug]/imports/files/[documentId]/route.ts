import { TRPCClientError } from "@trpc/client";
import { connection } from "next/server";
import { getServerTrpcClient } from "@/lib/trpc/server";

type DocumentParams = Promise<{ slug: string; documentId: string }>;

export async function GET(
	_request: Request,
	{ params }: { params: DocumentParams },
): Promise<Response> {
	await connection();
	const { documentId } = await params;

	try {
		const { url } =
			await getServerTrpcClient().importDocuments.downloadUrl.query({
				id: documentId,
			});
		return Response.redirect(url, 302);
	} catch (error) {
		if (!(error instanceof TRPCClientError)) throw error;
		const status = error.data?.httpStatus ?? 502;
		return new Response(error.message, {
			status,
			headers: {
				"content-type": "text/plain; charset=utf-8",
				"cache-control": "no-store",
			},
		});
	}
}
