# Shipment Documents (part 3 of 8: expected labels per stage) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `importStages.setExpectedLabels` and `expectedLabelIds` per stage. A process duplicate copies the links.

**Architecture:** The stage service gets one mutation. `importStages.settings` returns the active expected labels of each stage. `ImportProcessesService.duplicate` copies the links onto the new stage keys.

**Tech Stack:** bun test, Prisma 7, NestJS with `nestjs-trpc`, Zod 4.

Spec: `docs/superpowers/specs/2026-11-16-shipment-documents-design.md`. Parts, run in order: `-a.md` (Tasks 1 and 2: rules, database), `-b.md` (Task 3: labels API), `-c.md` (Task 4: expected labels), `-d.md` (Task 5a: upload token and attach), `-e.md` (Tasks 5b and 6: remove, download, order detail), `-f.md` (Task 7a: helpers, labels screen), `-g.md` (Task 8: documents panel, upload, download), `-h.md` (Tasks 7b, 9 and 10: stage editor, seed, docs, checks). Every file is in `docs/superpowers/plans/` with the prefix `2026-11-16-shipment-documents`.

Parts 1 and 2 must be done.

## Rules that apply to every task

- No code comments.
- All new text is neutral Spanish, including server errors. No voseo: "Elige", never "Elegí".
- Do not run `migrate dev`, `migrate reset` or `db push`. The migration is written by hand. The owner applies it.
- Do not read `.env`. Use `--env-file`. Do not build. Do not run `bun run format`.
- Edit existing files with exact old/new replacements (the `Edit` tool). Do not use `sd`.
- Format only the files you touched: `bunx biome format --write <paths>`, then `bunx biome check <paths>`. Give each path as its own argument. Quote paths with brackets or parentheses. If `biome check` reports only import order, run `bunx biome check --write <paths>`.
- **Do not commit.** No `git add`, no `git commit`, no `Co-Authored-By`.
- Another session edits `apps/app`, `apps/api` and docs. Before you edit a shared file (`schema.prisma`, `app.module.ts`, `generated/server.ts`, `import-processes.service.ts`, `import-stages.*`), run `rtk proxy git diff --no-color HEAD -- <file>`. If it shows a hunk that this plan did not write and that collides with an old text below, stop and ask the owner.
- Never call `Promise.all` on a transaction client (`tx`).
- `lint:slop` rejects `.catch((x: unknown) => x)`, parameters typed `unknown` or `object`, `Record<string, unknown>` and `...(condition ? {...} : {})`.
- `noUncheckedIndexedAccess` is on. Guard `list[index]`.
- **Integration specs share `crm_test`.** Every spec here removes its own rows in foreign key order: processes (through `removeTestProcesses`, which cascades shipments, events, files and stage links), then labels, products, members, users. After a failed run, run the leftover check in part 8 (`-h.md`), Task 10 Step 6.

The decisions are in part 1 (`-a.md`), *Decisions recorded in this plan*.

## File structure (this part)

| File | Responsibility |
| --- | --- |
| `apps/api/src/imports/import-stages.{contracts,service,router}.ts` | `expectedLabelIds`, `setExpectedLabels` |
| `apps/api/src/import-processes/import-processes.service.ts` | Duplicate copies links |
| `apps/api/test/import-stage-documents.integration.spec.ts` | Expected labels tests |
| `apps/app/test/import-stage-settings.spec.ts` | Fixture gets `expectedLabelIds` |
| `apps/api/src/generated/server.ts` | Regenerated |

---

### Task 4: Expected labels per stage

**Files:**
- Create: `apps/api/test/import-stage-documents.integration.spec.ts`
- Modify: `apps/api/src/imports/import-stages.contracts.ts`
- Modify: `apps/api/src/imports/import-stages.service.ts`
- Modify: `apps/api/src/imports/import-stages.router.ts`
- Modify: `apps/api/src/import-processes/import-processes.service.ts`
- Modify: `apps/app/test/import-stage-settings.spec.ts`
- Modify (generated): `apps/api/src/generated/server.ts`

- [ ] **Step 1: Check the files are as this plan expects**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rtk proxy rg -n "shipmentCount: perStage.get\(row.key\) \?\? 0,|private async lock\(|stages: \{ create: keyedStages\(steps, taken\) \}|shipmentCount: z.number\(\)," apps/api/src/imports/import-stages.service.ts apps/api/src/imports/import-stages.contracts.ts apps/api/src/import-processes/import-processes.service.ts`
Expected: one line each in the stage service (2 lines), the contracts (1) and the process service (1). Otherwise stop and ask the owner.

- [ ] **Step 2: Write the failing tests**

Create `apps/api/test/import-stage-documents.integration.spec.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth/organization";
import { db } from "@crm/db";
import { DocumentDirection } from "@crm/db/enums";
import { IMPORT_DOCUMENT } from "@crm/db/import-document";
import { workspaceSlug } from "@crm/db/workspace";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { ImportProcessesService } from "../src/import-processes/import-processes.service";
import {
	type ImportStageSettings,
	importStageExpectedLabelsInput,
	importStageSettingsOutput,
} from "../src/imports/import-stages.contracts";
import { ImportStagesService } from "../src/imports/import-stages.service";
import { expectOutput } from "./expect-output";
import {
	createTestProcess,
	removeTestProcesses,
	type TestProcess,
} from "./import-process-fixture";

const suffix = crypto.randomUUID().slice(0, 8);
const token = suffix.toUpperCase();
const adminId = `isd-admin-${suffix}`;
const memberId = `isd-member-${suffix}`;
const prefix = `SD${token}`;

const service = new ImportStagesService(db);
const processes = new ImportProcessesService(db);

let mainProcess: TestProcess;
let sideProcess: TestProcess;
let copyId: string | null = null;
let invoiceId: string;
let packingId: string;
let receiptId: string;

async function settingsOf(userId: string, processId: string) {
	return expectOutput(
		importStageSettingsOutput,
		await service.settings(userId, processId),
	);
}

async function setLabels(key: string, labelIds: string[]) {
	return expectOutput(
		importStageSettingsOutput,
		await service.setExpectedLabels(adminId, { key, labelIds }),
	);
}

function rowOf(settings: ImportStageSettings, key: string) {
	const found = settings.stages.find((stage) => stage.key === key);
	if (!found) throw new Error(`No stage ${key}.`);
	return found;
}

async function label(text: string, archived = false) {
	const created = await db.documentLabel.create({
		data: {
			name: `${prefix} ${text}`,
			direction: DocumentDirection.IN,
			archivedAt: archived ? new Date() : null,
		},
		select: { id: true },
	});
	return created.id;
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
			{ id: adminId, name: "Stage Doc Admin", email: `${adminId}@example.test` },
			{
				id: memberId,
				name: "Stage Doc Member",
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
	mainProcess = await createTestProcess(`Documentos ${suffix}`);
	sideProcess = await createTestProcess(`Documentos lado ${suffix}`);
	invoiceId = await label("Factura");
	packingId = await label("Packing list");
	receiptId = await label("Recibo");
});

afterAll(async () => {
	await removeTestProcesses(
		[mainProcess.id, sideProcess.id, copyId].filter(
			(id): id is string => id !== null,
		),
	);
	await db.documentLabel.deleteMany({ where: { name: { startsWith: prefix } } });
	await db.member.deleteMany({ where: { userId: { in: [adminId, memberId] } } });
	await db.user.deleteMany({ where: { id: { in: [adminId, memberId] } } });
});

describe("expected labels of a stage", () => {
	it("saves the labels in the given order", async () => {
		const settings = await setLabels(mainProcess.entryKey, [
			packingId,
			invoiceId,
		]);

		expect(rowOf(settings, mainProcess.entryKey).expectedLabelIds).toEqual([
			packingId,
			invoiceId,
		]);
		expect(rowOf(settings, mainProcess.receivedKey).expectedLabelIds).toEqual(
			[],
		);
	});

	it("replaces the list, and an empty list clears it", async () => {
		await setLabels(mainProcess.receivedKey, [invoiceId, receiptId]);

		const replaced = await setLabels(mainProcess.receivedKey, [receiptId]);
		expect(rowOf(replaced, mainProcess.receivedKey).expectedLabelIds).toEqual([
			receiptId,
		]);

		const cleared = await setLabels(mainProcess.receivedKey, []);
		expect(rowOf(cleared, mainProcess.receivedKey).expectedLabelIds).toEqual(
			[],
		);
	});

	it("refuses an archived or unknown label and changes nothing", async () => {
		await setLabels(mainProcess.cancelledKey, [invoiceId]);
		const archived = await label("Archivada", true);

		await expect(
			service.setExpectedLabels(adminId, {
				key: mainProcess.cancelledKey,
				labelIds: [invoiceId, archived],
			}),
		).rejects.toBeInstanceOf(BadRequestException);
		await expect(
			service.setExpectedLabels(adminId, {
				key: mainProcess.cancelledKey,
				labelIds: [`missing-${suffix}`],
			}),
		).rejects.toBeInstanceOf(BadRequestException);
		expect(
			rowOf(
				await settingsOf(adminId, mainProcess.id),
				mainProcess.cancelledKey,
			).expectedLabelIds,
		).toEqual([invoiceId]);
	});

	it("hides an archived label and keeps its link for a restore", async () => {
		const temporary = await label("Temporal");
		await setLabels(sideProcess.entryKey, [temporary, invoiceId]);
		await db.documentLabel.update({
			where: { id: temporary },
			data: { archivedAt: new Date() },
		});

		expect(
			rowOf(await settingsOf(adminId, sideProcess.id), sideProcess.entryKey)
				.expectedLabelIds,
		).toEqual([invoiceId]);

		await setLabels(sideProcess.entryKey, [invoiceId]);
		await db.documentLabel.update({
			where: { id: temporary },
			data: { archivedAt: null },
		});

		expect(
			rowOf(await settingsOf(adminId, sideProcess.id), sideProcess.entryKey)
				.expectedLabelIds,
		).toEqual([invoiceId, temporary]);
	});

	it("validates the list at the boundary", () => {
		expect(
			importStageExpectedLabelsInput.safeParse({ key: "K", labelIds: [] })
				.success,
		).toBe(true);
		expect(
			importStageExpectedLabelsInput.safeParse({
				key: "K",
				labelIds: ["a", "a"],
			}).success,
		).toBe(false);
		expect(
			importStageExpectedLabelsInput.safeParse({
				key: "K",
				labelIds: Array.from(
					{ length: IMPORT_DOCUMENT.maxExpectedLabels + 1 },
					(_, index) => `l-${index}`,
				),
			}).success,
		).toBe(false);
	});

	it("copies the expected labels when a process is duplicated", async () => {
		await setLabels(mainProcess.entryKey, [packingId, invoiceId]);
		const copyName = `Copia documentos ${suffix}`;

		const list = await processes.duplicate(adminId, {
			id: mainProcess.id,
			name: copyName,
		});
		const copy = list.processes.find((row) => row.name === copyName);
		if (!copy) throw new Error("The copy is missing.");
		copyId = copy.id;

		const copied = await settingsOf(adminId, copy.id);
		const entry = copied.stages.find((stage) => stage.isEntry);
		expect(entry?.key).not.toBe(mainProcess.entryKey);
		expect(entry?.expectedLabelIds).toEqual([packingId, invoiceId]);
	});
});

describe("permissions", () => {
	it("lets a member read and refuses the write", async () => {
		const settings = await settingsOf(memberId, mainProcess.id);

		expect(settings.canManage).toBe(false);
		await expect(
			service.setExpectedLabels(memberId, {
				key: mainProcess.entryKey,
				labelIds: [],
			}),
		).rejects.toBeInstanceOf(ForbiddenException);
	});
});
```

- [ ] **Step 3: Run them and see them fail**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/import-stage-documents.integration.spec.ts`
Expected: FAIL. `importStageExpectedLabelsInput` is undefined or `setExpectedLabels is not a function`.

- [ ] **Step 4: Change the contracts**

In `apps/api/src/imports/import-stages.contracts.ts`, replace:

```ts
import { IMPORT_STAGE } from "@crm/db/import-stage";
```

with:

```ts
import { IMPORT_DOCUMENT } from "@crm/db/import-document";
import { IMPORT_STAGE } from "@crm/db/import-stage";
```

Replace:

```ts
export const importStageKeyInput = z.object({ key: stageKeyInput });
```

with:

```ts
export const importStageKeyInput = z.object({ key: stageKeyInput });

export const importStageExpectedLabelsInput = z.object({
	key: stageKeyInput,
	labelIds: z
		.array(z.string().min(1))
		.max(
			IMPORT_DOCUMENT.maxExpectedLabels,
			`Máximo ${IMPORT_DOCUMENT.maxExpectedLabels} documentos por etapa.`,
		)
		.refine(
			(ids) => new Set(ids).size === ids.length,
			"Un documento está repetido.",
		),
});
```

Replace:

```ts
	shipmentCount: z.number(),
});
```

with:

```ts
	shipmentCount: z.number(),
	expectedLabelIds: z.array(z.string()),
});
```

Replace:

```ts
export type ImportStageKeyInput = z.infer<typeof importStageKeyInput>;
```

with:

```ts
export type ImportStageKeyInput = z.infer<typeof importStageKeyInput>;
export type ImportStageExpectedLabelsInput = z.infer<
	typeof importStageExpectedLabelsInput
>;
```

- [ ] **Step 5: Change the stage service**

In `apps/api/src/imports/import-stages.service.ts`, replace:

```ts
	ImportStageCreateInput,
	ImportStageReorderInput,
```

with:

```ts
	ImportStageCreateInput,
	ImportStageExpectedLabelsInput,
	ImportStageReorderInput,
```

Replace:

```ts
			this.db.importStage.findMany({
				where: { processId },
				orderBy: { position: "asc" },
			}),
```

with:

```ts
			this.db.importStage.findMany({
				where: { processId },
				orderBy: { position: "asc" },
				include: {
					documents: {
						where: { label: { archivedAt: null } },
						orderBy: [{ position: "asc" }, { label: { name: "asc" } }],
						select: { labelId: true },
					},
				},
			}),
```

Replace:

```ts
				shipmentCount: perStage.get(row.key) ?? 0,
```

with:

```ts
				shipmentCount: perStage.get(row.key) ?? 0,
				expectedLabelIds: row.documents.map((document) => document.labelId),
```

Replace:

```ts
	private async lock(
```

with:

```ts
	async setExpectedLabels(
		actingUserId: string,
		input: ImportStageExpectedLabelsInput,
	): Promise<ImportStageSettings> {
		await this.requireManager(actingUserId);

		const processId = await this.db.$transaction(async (tx) => {
			const stage = await this.lock(tx, input.key);
			if (input.labelIds.length > 0) {
				const active = await tx.documentLabel.count({
					where: { id: { in: input.labelIds }, archivedAt: null },
				});
				if (active !== input.labelIds.length) {
					throw new BadRequestException(
						"Una etiqueta no existe o está archivada.",
					);
				}
			}
			await tx.importStageDocument.deleteMany({
				where: { stageKey: stage.key, label: { archivedAt: null } },
			});
			await tx.importStageDocument.createMany({
				data: input.labelIds.map((labelId, position) => ({
					stageKey: stage.key,
					labelId,
					position,
				})),
			});
			return stage.processId;
		});

		return this.settings(actingUserId, processId);
	}

	private async lock(
```

- [ ] **Step 6: Add the route**

In `apps/api/src/imports/import-stages.router.ts`, replace:

```ts
	type ImportStageCreateInput,
	type ImportStageKeyInput,
```

with:

```ts
	type ImportStageCreateInput,
	type ImportStageExpectedLabelsInput,
	type ImportStageKeyInput,
```

Replace:

```ts
	importStageCreateInput,
	importStageKeyInput,
```

with:

```ts
	importStageCreateInput,
	importStageExpectedLabelsInput,
	importStageKeyInput,
```

Replace:

```ts
	@Mutation({
		input: importStageKeyInput,
```

with:

```ts
	@Mutation({
		input: importStageExpectedLabelsInput,
		output: importStageSettingsOutput,
		meta: restMeta("PUT", "/import-stages/{key}/documents", TAGS),
	})
	async setExpectedLabels(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: ImportStageExpectedLabelsInput,
	) {
		return this.stages.setExpectedLabels(ctx.user.id, input);
	}

	@Mutation({
		input: importStageKeyInput,
```

- [ ] **Step 7: Copy the links on duplicate**

In `apps/api/src/import-processes/import-processes.service.ts`, replace:

```ts
			const steps = await tx.importStage.findMany({
				where: { processId: source.id, archivedAt: null },
				orderBy: { position: "asc" },
				select: {
					name: true,
					kind: true,
					tone: true,
					position: true,
					isEntry: true,
				},
			});
			const taken = await this.takenKeys(tx);
			await tx.importProcess.create({
				data: {
					name: input.name,
					countryCode: source.countryCode,
					stages: { create: keyedStages(steps, taken) },
				},
			});
```

with:

```ts
			const steps = await tx.importStage.findMany({
				where: { processId: source.id, archivedAt: null },
				orderBy: { position: "asc" },
				select: {
					name: true,
					kind: true,
					tone: true,
					position: true,
					isEntry: true,
					documents: { select: { labelId: true, position: true } },
				},
			});
			const taken = await this.takenKeys(tx);
			const keyed = keyedStages(
				steps.map((step) => ({
					name: step.name,
					kind: step.kind,
					tone: step.tone,
					position: step.position,
					isEntry: step.isEntry,
				})),
				taken,
			);
			await tx.importProcess.create({
				data: {
					name: input.name,
					countryCode: source.countryCode,
					stages: { create: keyed },
				},
			});
			const links = steps.flatMap((step, index) => {
				const stageKey = keyed[index]?.key;
				return stageKey
					? step.documents.map((document) => ({
							stageKey,
							labelId: document.labelId,
							position: document.position,
						}))
					: [];
			});
			await tx.importStageDocument.createMany({ data: links });
```

- [ ] **Step 8: Keep the app fixture in step**

In `apps/app/test/import-stage-settings.spec.ts`, replace:

```ts
		shipmentCount: 0,
		...extra,
```

with:

```ts
		shipmentCount: 0,
		expectedLabelIds: [],
		...extra,
```

- [ ] **Step 9: Run the tests and see them pass**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && CRM_TELEMETRY_DISABLED=1 bun --env-file=../../.env test --preload ./test/setup.ts test/import-stage-documents.integration.spec.ts test/import-stages.integration.spec.ts test/import-processes.integration.spec.ts`
Expected: the new spec has 7 pass. The two old specs pass as before, 0 fail. `expectOutput` in the old stage spec now checks `expectedLabelIds`.

- [ ] **Step 10: Regenerate the router**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rtk proxy git diff --no-color HEAD -- apps/api/src/generated/server.ts`
If it shows hunks this plan did not write, stop and ask the owner. Then:

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm/apps/api && bun run trpc:generate`
Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && rtk proxy git diff --no-color HEAD -- apps/api/src/generated/server.ts`
Expected (besides any earlier hunks): a `documentLabels` router with `list`, `create`, `update`, `archive`, `restore`, and `setExpectedLabels` in `importStages` with `.input(importStageExpectedLabelsInput)`. Never edit this file by hand.

- [ ] **Step 11: Type check**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bun run check-types --filter=api && bun run check-types --filter=@crm/db && bun run check-types --filter=app`
Expected: no errors. The app check proves the fixture of Step 8.

- [ ] **Step 12: Format**

Run: `cd /Users/lucaspellis/Desktop/Hobbies/surco-preciso/crm && bunx biome format --write apps/api/test/import-stage-documents.integration.spec.ts apps/api/src/imports/import-stages.contracts.ts apps/api/src/imports/import-stages.service.ts apps/api/src/imports/import-stages.router.ts apps/api/src/import-processes/import-processes.service.ts apps/app/test/import-stage-settings.spec.ts && bunx biome check apps/api/test/import-stage-documents.integration.spec.ts apps/api/src/imports/import-stages.contracts.ts apps/api/src/imports/import-stages.service.ts apps/api/src/imports/import-stages.router.ts apps/api/src/import-processes/import-processes.service.ts apps/app/test/import-stage-settings.spec.ts`
Expected: no errors.

- [ ] **Step 13: Hand over**

Tell the owner: parts 1 to 3 are done. Report the pass counts of Task 1 (10), Task 3 (8) and Task 4 (7). Part 4 (`docs/superpowers/plans/2026-11-16-shipment-documents-d.md`) is next. Do not commit.

---

## Self-review (parts 1 to 3)

| Brief item | Where |
| --- | --- |
| Pure helpers with tests: checklist, type and size, pathname | Task 1 |
| Max size and types in one config module | Task 1, `IMPORT_DOCUMENT` |
| `Attachment`, `DocumentLabel` with `direction`, `ImportStageDocument` | Task 2 |
| Migration stop for `db:deploy` and `db:test` | Task 2 Step 7 |
| Labels list, create, rename, archive, restore, `expectOutput` | Task 3 |
| Owner and admin only, member refused | Task 3 and Task 4 permissions tests |
| Race on label names | Task 3 Step 1 and Step 8 |
| Archived label stays on old links, leaves the checklist | Task 4 "hides an archived label…" |
| Expected labels per stage, order, replace | Task 4 |
| Duplicate keeps the checklist | Task 4 Step 7 and its test |

**Placeholder scan.** No step says "similar to" or "TODO". Every edit names its exact old and new text.

**Name consistency.** `IMPORT_DOCUMENT`, `documentChecklist`, `documentFileProblem`, `documentContentType`, `documentPathname`, `documentPathPrefix`, `isDocumentPathOf`, `DOCUMENT_ACCEPT` and `DOCUMENT_PROBLEM_MESSAGES` (Task 1) are used by parts 4 to 7. `documentLabels.*` and `importStages.setExpectedLabels` are the procedures parts 6 and 7 call. `expectedLabelIds` is the row field part 7 reads.

**Symbols checked on 2026-11-16.** `keyedStages`, `createTestProcess`, `removeTestProcesses`, `expectOutput`, `restMeta`, `AuthMiddleware`, `InjectDatabase`, `canManageInventory`, `workspaceRoleOf`, `ImportProcessesService.duplicate` and every old text exist once in their file.

**Known risks.**
- The migration is written by hand. A name mismatch with the schema shows as drift on the owner's next `prisma migrate dev`.
- `setExpectedLabels` reads the label count without a lock. A label archived in the same instant can stay linked. The read filters archived labels, so nothing wrong shows.
- Schema columns are hand-aligned. `prisma format` is not run, so the alignment can differ from Prisma's.
