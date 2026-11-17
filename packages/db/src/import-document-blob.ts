import { blobEnabled } from "./blob";
import { IMPORT_DOCUMENT } from "./import-document";

export type StoredDocument = {
	pathname: string;
	size: number;
	contentType: string;
};

export const documentBlob = {
	enabled(): boolean {
		return blobEnabled();
	},

	async clientToken(input: {
		pathname: string;
		contentType: string;
		validUntil: number;
	}): Promise<string> {
		const { generateClientTokenFromReadWriteToken } = await import(
			"@vercel/blob/client"
		);
		return generateClientTokenFromReadWriteToken({
			pathname: input.pathname,
			allowedContentTypes: [input.contentType],
			maximumSizeInBytes: IMPORT_DOCUMENT.maxBytes,
			validUntil: input.validUntil,
			addRandomSuffix: false,
			allowOverwrite: false,
		});
	},

	async stat(pathname: string): Promise<StoredDocument | null> {
		const { BlobNotFoundError, head } = await import("@vercel/blob");
		try {
			const found = await head(pathname);
			return {
				pathname: found.pathname,
				size: found.size,
				contentType: found.contentType,
			};
		} catch (error) {
			if (error instanceof BlobNotFoundError) return null;
			throw error;
		}
	},

	async remove(pathname: string): Promise<void> {
		const { del } = await import("@vercel/blob");
		await del(pathname);
	},

	async downloadUrl(pathname: string, validUntil: number): Promise<string> {
		const { issueSignedToken, presignUrl } = await import("@vercel/blob");
		const signed = await issueSignedToken({
			pathname,
			operations: ["get"],
			validUntil,
		});
		const { presignedUrl } = await presignUrl(signed, {
			operation: "get",
			pathname,
			validUntil,
			access: IMPORT_DOCUMENT.access,
		});
		return presignedUrl;
	},
};
