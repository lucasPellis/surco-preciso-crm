import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth/organization";
import { db } from "@crm/db";
import { DocumentDirection } from "@crm/db/enums";
import {
	documentPathname,
	documentPathPrefix,
	IMPORT_DOCUMENT,
	isDocumentPathOf,
} from "@crm/db/import-document";
import { documentBlob } from "@crm/db/import-document-blob";
import { workspaceSlug } from "@crm/db/workspace";
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	NotFoundException,
} from "@nestjs/common";
import {
	type DocumentAttachInput,
	type DocumentUploadInput,
	documentAttachInput,
	documentDownloadOutput,
	documentUploadOutput,
} from "../src/import-documents/import-documents.contracts";
import { ImportDocumentsService } from "../src/import-documents/import-documents.service";
import {
	type ImportOrderDetail,
	importOrderDetailOutput,
} from "../src/import-orders/import-orders.contracts";
import { ImportOrdersService } from "../src/import-orders/import-orders.service";
import { expectOutput } from "./expect-output";
import {
	createTestProcess,
	removeTestProcesses,
	type TestProcess,
} from "./import-process-fixture";

const suffix = crypto.randomUUID().slice(0, 8);
const token = suffix.toUpperCase();
const adminId = `idoc-admin-${suffix}`;
const memberId = `idoc-member-${suffix}`;
const prefix = `ID${token}`;
const NOW = new Date("2026-03-01T15:00:00.000Z");
const PDF = "application/pdf";
const SIGNED = "https://blob.example.test/signed";

const ordersService = new ImportOrdersService(db);
const service = new ImportDocumentsService(db, ordersService);
const detailOf = (value: ImportOrderDetail) =>
	expectOutput(importOrderDetailOutput, value);

const enabled = spyOn(documentBlob, "enabled").mockReturnValue(true);
const clientToken = spyOn(documentBlob, "clientToken").mockResolvedValue(
	"client-token",
);
const stat = spyOn(documentBlob, "stat").mockImplementation(
	async (pathname: string) => ({ pathname, size: 2048, contentType: PDF }),
);
const removeBlob = spyOn(documentBlob, "remove").mockResolvedValue(undefined);
const signedUrl = spyOn(documentBlob, "downloadUrl").mockResolvedValue(SIGNED);

let processRef: TestProcess;
let productId: string;
let labelId: string;
let archivedLabelId: string;

function shipmentOf(order: ImportOrderDetail) {
	const shipment = order.shipments[0];
	if (!shipment) throw new Error("The order has no shipment.");
	return shipment;
}

function eventOf(order: ImportOrderDetail) {
	const event = shipmentOf(order).events.at(-1);
	if (!event) throw new Error("The shipment has no event.");
	return event;
}

async function shipmentOrder(): Promise<ImportOrderDetail> {
	const order = await ordersService.create(
		adminId,
		{
			supplierName: "Proveedor de prueba",
			orderedAt: "2026-01-05",
			notes: "",
			processId: processRef.id,
			lines: [{ productId, quantity: 4, unitCostCents: 1000, dealId: null }],
		},
		NOW,
	);
	const line = order.lines[0];
	if (!line) throw new Error("The order has no line.");
	return detailOf(
		await ordersService.createShipment(
			adminId,
			{
				orderId: order.id,
				reference: "",
				trackingNumber: "",
				occurredAt: "2026-01-10",
				lines: [{ orderLineId: line.id, quantity: 4 }],
			},
			NOW,
		),
	);
}

function upload(
	order: ImportOrderDetail,
	overrides: Partial<DocumentUploadInput> = {},
) {
	return service.uploadToken(
		adminId,
		{
			eventId: eventOf(order).id,
			filename: "Factura PI.pdf",
			contentType: PDF,
			size: 2048,
			...overrides,
		},
		NOW,
	);
}

async function uploaded(
	order: ImportOrderDetail,
	overrides: Partial<DocumentAttachInput> = {},
) {
	const ticket = await upload(order);
	return detailOf(
		await service.attach(
			adminId,
			{
				eventId: eventOf(order).id,
				pathname: ticket.pathname,
				filename: "Factura PI.pdf",
				labelId,
				...overrides,
			},
			NOW,
		),
	);
}

function filesOf(order: ImportOrderDetail) {
	return db.attachment.findMany({
		where: { shipmentStageEvent: { shipmentId: shipmentOf(order).id } },
		orderBy: { createdAt: "asc" },
	});
}

beforeAll(async () => {
	await db.organization.upsert({
		where: { id: WORKSPACE_ID },
		update: {},
		create: {
			id: WORKSPACE_ID,
			name: DEFAULT_WORKSPACE_NAME,
			slug: workspaceSlug(DEFAULT_WORKSPACE_NAME),
			createdAt: new Date(),
		},
	});
	await db.user.createMany({
		data: [
			{
				id: adminId,
				name: "Import Document Admin",
				email: `${adminId}@example.test`,
			},
			{
				id: memberId,
				name: "Import Document Member",
				email: `${memberId}@example.test`,
			},
		],
	});
	await db.member.createMany({
		data: [
			{
				id: `m-${adminId}`,
				organizationId: WORKSPACE_ID,
				userId: adminId,
				role: "admin",
				createdAt: new Date(),
			},
			{
				id: `m-${memberId}`,
				organizationId: WORKSPACE_ID,
				userId: memberId,
				role: "member",
				createdAt: new Date(),
			},
		],
	});
	processRef = await createTestProcess(`Documentos envío ${suffix}`);
	productId = (
		await db.product.create({
			data: { sku: `${prefix}-A`, name: "Equipo A" },
			select: { id: true },
		})
	).id;
	labelId = (
		await db.documentLabel.create({
			data: { name: `${prefix} Factura`, direction: DocumentDirection.IN },
			select: { id: true },
		})
	).id;
	archivedLabelId = (
		await db.documentLabel.create({
			data: {
				name: `${prefix} Vieja`,
				direction: DocumentDirection.IN,
				archivedAt: new Date(),
			},
			select: { id: true },
		})
	).id;
});

afterAll(async () => {
	for (const spy of [enabled, clientToken, stat, removeBlob, signedUrl]) {
		spy.mockRestore();
	}
	await removeTestProcesses([processRef.id]);
	await db.documentLabel.deleteMany({
		where: { name: { startsWith: prefix } },
	});
	await db.product.deleteMany({ where: { sku: { startsWith: prefix } } });
	await db.member.deleteMany({
		where: { userId: { in: [adminId, memberId] } },
	});
	await db.user.deleteMany({ where: { id: { in: [adminId, memberId] } } });
});

describe("upload token", () => {
	it("issues a token for one path under the shipment event", async () => {
		const order = await shipmentOrder();

		const ticket = expectOutput(documentUploadOutput, await upload(order));

		expect(
			isDocumentPathOf(
				ticket.pathname,
				shipmentOf(order).id,
				eventOf(order).id,
			),
		).toBe(true);
		expect(ticket.pathname.endsWith("-Factura-PI.pdf")).toBe(true);
		expect(ticket.token).toBe("client-token");
		expect(clientToken).toHaveBeenLastCalledWith({
			pathname: ticket.pathname,
			contentType: PDF,
			validUntil: NOW.getTime() + IMPORT_DOCUMENT.uploadTokenTtlMs,
		});
	});

	it("refuses a bad type, an empty file and a large file before any token", async () => {
		const order = await shipmentOrder();
		const before = clientToken.mock.calls.length;

		await expect(
			upload(order, { contentType: "application/zip" }),
		).rejects.toBeInstanceOf(BadRequestException);
		await expect(upload(order, { size: 0 })).rejects.toBeInstanceOf(
			BadRequestException,
		);
		await expect(
			upload(order, { size: IMPORT_DOCUMENT.maxBytes + 1 }),
		).rejects.toBeInstanceOf(BadRequestException);
		await expect(
			upload(order, { eventId: `missing-${suffix}` }),
		).rejects.toBeInstanceOf(NotFoundException);
		expect(clientToken.mock.calls.length).toBe(before);
	});

	it("refuses when storage is not configured", async () => {
		const order = await shipmentOrder();
		enabled.mockReturnValueOnce(false);

		await expect(upload(order)).rejects.toBeInstanceOf(ConflictException);
	});
});

describe("attaching a file", () => {
	it("saves the size and type of the store, not of the browser", async () => {
		const order = await shipmentOrder();
		const ticket = await upload(order, { size: 1 });
		stat.mockImplementationOnce(async (pathname: string) => ({
			pathname,
			size: 4096,
			contentType: PDF,
		}));

		detailOf(
			await service.attach(
				adminId,
				{
					eventId: eventOf(order).id,
					pathname: ticket.pathname,
					filename: "Factura PI.pdf",
					labelId,
				},
				NOW,
			),
		);

		const row = await db.attachment.findUniqueOrThrow({
			where: { pathname: ticket.pathname },
		});
		expect(row).toMatchObject({
			filename: "Factura PI.pdf",
			size: 4096,
			contentType: PDF,
			labelId,
			uploadedById: adminId,
			shipmentStageEventId: eventOf(order).id,
		});
	});

	it("refuses a path of another shipment and a nested path, and reads nothing", async () => {
		const order = await shipmentOrder();
		const other = await shipmentOrder();
		const foreign = documentPathname({
			shipmentId: shipmentOf(other).id,
			eventId: eventOf(other).id,
			nonce: "n1",
			filename: "x.pdf",
		});
		const nested = `${documentPathPrefix(shipmentOf(order).id, eventOf(order).id)}a/b.pdf`;
		const reads = stat.mock.calls.length;

		for (const pathname of [foreign, nested]) {
			await expect(
				service.attach(
					adminId,
					{
						eventId: eventOf(order).id,
						pathname,
						filename: "x.pdf",
						labelId: null,
					},
					NOW,
				),
			).rejects.toBeInstanceOf(BadRequestException);
		}
		expect(stat.mock.calls.length).toBe(reads);
		expect(await filesOf(order)).toEqual([]);
	});

	it("refuses a file the store does not have and removes nothing", async () => {
		const order = await shipmentOrder();
		const ticket = await upload(order);
		stat.mockResolvedValueOnce(null);
		const removals = removeBlob.mock.calls.length;

		await expect(
			service.attach(
				adminId,
				{
					eventId: eventOf(order).id,
					pathname: ticket.pathname,
					filename: "Factura PI.pdf",
					labelId,
				},
				NOW,
			),
		).rejects.toBeInstanceOf(BadRequestException);
		expect(removeBlob.mock.calls.length).toBe(removals);
	});

	it("removes a stored file that breaks the rule", async () => {
		const order = await shipmentOrder();
		const large = await upload(order);
		stat.mockImplementationOnce(async (pathname: string) => ({
			pathname,
			size: IMPORT_DOCUMENT.maxBytes + 1,
			contentType: PDF,
		}));

		await expect(
			service.attach(
				adminId,
				{
					eventId: eventOf(order).id,
					pathname: large.pathname,
					filename: "Factura PI.pdf",
					labelId,
				},
				NOW,
			),
		).rejects.toBeInstanceOf(BadRequestException);
		expect(removeBlob).toHaveBeenCalledWith(large.pathname);

		const html = await upload(order);
		stat.mockImplementationOnce(async (pathname: string) => ({
			pathname,
			size: 10,
			contentType: "text/html",
		}));
		await expect(
			service.attach(
				adminId,
				{
					eventId: eventOf(order).id,
					pathname: html.pathname,
					filename: "Factura PI.pdf",
					labelId,
				},
				NOW,
			),
		).rejects.toBeInstanceOf(BadRequestException);
		expect(removeBlob).toHaveBeenCalledWith(html.pathname);
		expect(await filesOf(order)).toEqual([]);
	});

	it("refuses an archived or unknown label and removes the upload", async () => {
		const order = await shipmentOrder();

		for (const badLabel of [archivedLabelId, `missing-${suffix}`]) {
			const ticket = await upload(order);
			await expect(
				service.attach(
					adminId,
					{
						eventId: eventOf(order).id,
						pathname: ticket.pathname,
						filename: "Factura PI.pdf",
						labelId: badLabel,
					},
					NOW,
				),
			).rejects.toBeInstanceOf(BadRequestException);
			expect(removeBlob).toHaveBeenCalledWith(ticket.pathname);
		}
		expect(await filesOf(order)).toEqual([]);
	});

	it("allows a file without a label and a file on a received shipment", async () => {
		const order = await shipmentOrder();
		await uploaded(order, { labelId: null });
		const received = detailOf(
			await ordersService.moveShipment(
				adminId,
				{
					shipmentId: shipmentOf(order).id,
					targetKey: processRef.receivedKey,
					occurredAt: "2026-01-20",
				},
				NOW,
			),
		);

		await uploaded(received);

		const files = await filesOf(order);
		expect(files.map((file) => file.labelId)).toEqual([null, labelId]);
		expect(files[1]?.shipmentStageEventId).toBe(eventOf(received).id);
	});

	it("keeps one row when the same upload is attached twice at once", async () => {
		const order = await shipmentOrder();
		const ticket = await upload(order);
		const input = {
			eventId: eventOf(order).id,
			pathname: ticket.pathname,
			filename: "Doble.pdf",
			labelId: null,
		};
		const removals = removeBlob.mock.calls.length;

		const results = await Promise.allSettled([
			service.attach(adminId, input, NOW),
			service.attach(adminId, input, NOW),
		]);

		expect(
			results.filter((result) => result.status === "fulfilled").length,
		).toBe(1);
		expect(
			await db.attachment.count({ where: { pathname: ticket.pathname } }),
		).toBe(1);
		expect(removeBlob.mock.calls.length).toBe(removals);
	});

	it("validates the attach at the boundary", () => {
		const valid = {
			eventId: "e-1",
			pathname: "import-documents/s/e/n-a.pdf",
			filename: "a.pdf",
			labelId: null,
		};

		expect(documentAttachInput.safeParse(valid).success).toBe(true);
		expect(
			documentAttachInput.safeParse({ ...valid, filename: " " }).success,
		).toBe(false);
		expect(
			documentAttachInput.safeParse({
				...valid,
				filename: "x".repeat(IMPORT_DOCUMENT.filenameMaxLength + 1),
			}).success,
		).toBe(false);
	});
});

describe("removing and downloading a file", () => {
	it("removes the row even when the store fails", async () => {
		const order = await shipmentOrder();
		await uploaded(order);
		const [file] = await filesOf(order);
		if (!file) throw new Error("No file.");
		removeBlob.mockRejectedValueOnce(new Error("store down"));

		detailOf(await service.remove(adminId, file.id, NOW));

		expect(await db.attachment.count({ where: { id: file.id } })).toBe(0);
		expect(removeBlob).toHaveBeenCalledWith(file.pathname);
		await expect(service.remove(adminId, file.id, NOW)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});

	it("removes once when two removes race", async () => {
		const order = await shipmentOrder();
		await uploaded(order);
		const [file] = await filesOf(order);
		if (!file) throw new Error("No file.");

		const results = await Promise.allSettled([
			service.remove(adminId, file.id, NOW),
			service.remove(adminId, file.id, NOW),
		]);

		expect(
			results.filter((result) => result.status === "fulfilled").length,
		).toBe(1);
		for (const result of results) {
			if (result.status === "rejected") {
				expect(result.reason).toBeInstanceOf(NotFoundException);
			}
		}
	});

	it("gives a member a short signed link", async () => {
		const order = await shipmentOrder();
		await uploaded(order);
		const [file] = await filesOf(order);
		if (!file) throw new Error("No file.");

		const link = expectOutput(
			documentDownloadOutput,
			await service.downloadUrl(memberId, file.id, NOW),
		);

		expect(link.url).toBe(SIGNED);
		expect(signedUrl).toHaveBeenLastCalledWith(
			file.pathname,
			NOW.getTime() + IMPORT_DOCUMENT.downloadUrlTtlMs,
		);
		await expect(
			service.downloadUrl(memberId, `missing-${suffix}`, NOW),
		).rejects.toBeInstanceOf(NotFoundException);
	});
});

describe("permissions", () => {
	it("lets a member download and refuses every write", async () => {
		const order = await shipmentOrder();
		await uploaded(order);
		const [file] = await filesOf(order);
		if (!file) throw new Error("No file.");

		const writes = [
			() =>
				service.uploadToken(
					memberId,
					{
						eventId: eventOf(order).id,
						filename: "a.pdf",
						contentType: PDF,
						size: 10,
					},
					NOW,
				),
			() =>
				service.attach(
					memberId,
					{
						eventId: eventOf(order).id,
						pathname: file.pathname,
						filename: "a.pdf",
						labelId: null,
					},
					NOW,
				),
			() => service.remove(memberId, file.id, NOW),
		];
		for (const write of writes) {
			await expect(write()).rejects.toBeInstanceOf(ForbiddenException);
		}
		expect((await service.downloadUrl(memberId, file.id, NOW)).url).toBe(
			SIGNED,
		);
	});
});

describe("the order detail", () => {
	it("lists the files of every stage and the checklist of each stage", async () => {
		const order = await shipmentOrder();
		await db.importStageDocument.createMany({
			data: [
				{ stageKey: processRef.entryKey, labelId, position: 0 },
				{
					stageKey: processRef.entryKey,
					labelId: archivedLabelId,
					position: 1,
				},
			],
			skipDuplicates: true,
		});

		const after = await uploaded(order);

		const entry = after.stages.find(
			(stage) => stage.key === processRef.entryKey,
		);
		expect(entry?.expectedLabels).toEqual([
			{
				id: labelId,
				name: `${prefix} Factura`,
				direction: DocumentDirection.IN,
				archived: false,
			},
		]);
		expect(shipmentOf(after).documents).toEqual([
			{
				id: expect.any(String),
				filename: "Factura PI.pdf",
				contentType: PDF,
				size: 2048,
				uploadedAt: expect.any(String),
				uploadedByName: "Import Document Admin",
				eventId: eventOf(order).id,
				stage: { key: processRef.entryKey, name: "Pedido" },
				label: {
					id: labelId,
					name: `${prefix} Factura`,
					direction: DocumentDirection.IN,
					archived: false,
				},
			},
		]);
	});

	it("keeps an archived label on its file", async () => {
		const order = await shipmentOrder();
		const temporary = (
			await db.documentLabel.create({
				data: { name: `${prefix} Temporal`, direction: DocumentDirection.OUT },
				select: { id: true },
			})
		).id;
		await uploaded(order, { labelId: temporary });
		await db.documentLabel.update({
			where: { id: temporary },
			data: { archivedAt: new Date() },
		});

		const after = detailOf(await ordersService.detail(adminId, order.id, NOW));

		expect(shipmentOf(after).documents[0]?.label).toMatchObject({
			id: temporary,
			archived: true,
		});
	});

	it("says whether storage is configured", async () => {
		const order = await shipmentOrder();

		enabled.mockReturnValueOnce(false);
		expect(
			detailOf(await ordersService.detail(memberId, order.id, NOW))
				.documentsEnabled,
		).toBe(false);
		expect(
			detailOf(await ordersService.detail(memberId, order.id, NOW))
				.documentsEnabled,
		).toBe(true);
	});
});
