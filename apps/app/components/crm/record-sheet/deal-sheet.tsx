"use client";

import { CURRENCIES, normalizeCurrency } from "@crm/db/currency";
import type { FieldValueJson } from "@crm/db/fields";
import { Button } from "@crm/ui/components/button";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import {
	EntityLogo,
	type EntityLogoTone,
} from "@crm/ui/components/entity-logo";
import { Icon } from "@crm/ui/components/icon";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import {
	RecordFigure,
	RecordSection,
	type RecordSheetTab,
} from "@crm/ui/components/record-sheet";
import { SimpleTable, SimpleTableRow } from "@crm/ui/components/simple-table";
import { TableCell } from "@crm/ui/components/table";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@crm/ui/components/tooltip";
import { formatMoney } from "@crm/ui/lib/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PlusIcon, UsersIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { AgentPanel } from "@/components/crm/agent-panel";
import { InlineCompanyField } from "@/components/crm/company-picker";
import { contactName } from "@/components/crm/contact-name";
import { FieldsCog, RecordFields } from "@/components/crm/fields/record-fields";
import {
	InlineDateField,
	InlineField,
	InlineSelectField,
	InlineTextArea,
	InlineTextCell,
	savingValue,
} from "@/components/crm/inline-field";
import { DealStageMenu } from "@/components/crm/stage-change";
import { StageStepper } from "@/components/crm/stage-stepper";
import { Timeline } from "@/components/crm/timeline/timeline";
import {
	DetailSheetEmpty,
	DetailSheetLoaded,
	DetailSheetProperties,
	DetailSheetProperty,
	DetailSheetSection,
} from "@/components/detail-sheet";
import {
	LocalDateTime,
	LocalDay,
	LocalRelativeTime,
} from "@/components/local-date-time";
import { savingField } from "@/lib/pending-field";
import { entityLogoTone } from "@/lib/recent-records";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { AttachDealContact } from "./quick-add";
import { RecordActions } from "./record-actions";
import { AddRow, RecordSheetFrame } from "./record-parts";
import { useOpenRecord, useRecordSheetView } from "./record-stack";

type Deal = RouterOutputs["deals"]["byId"];

const NONE = "none";

const CURRENCY_OPTIONS = CURRENCIES.map((entry) => ({
	value: entry.code,
	label: `${entry.code} (${entry.name})`,
}));

function dealCurrency(currency: string) {
	return normalizeCurrency(currency) || currency;
}

function currencyOptions(currency: string) {
	if (CURRENCY_OPTIONS.some((option) => option.value === currency)) {
		return CURRENCY_OPTIONS;
	}

	return [
		{ value: currency, label: `${currency} (ya no se admite)` },
		...CURRENCY_OPTIONS,
	];
}

function ReportedValue({ deal }: { deal: Deal }) {
	const currency = dealCurrency(deal.currency);

	if (currency === deal.reportingCurrency) return null;
	if (deal.amountCents === null) return null;

	return (
		<DetailSheetProperty label={`En ${deal.reportingCurrency}`}>
			{deal.baseAmountCents === null ? (
				<span className="text-muted-foreground">
					Sin cotización de {currency}, queda fuera de los totales
				</span>
			) : (
				<span className="tabular-nums text-muted-foreground">
					≈ {formatMoney(deal.baseAmountCents, deal.reportingCurrency)}
				</span>
			)}
		</DetailSheetProperty>
	);
}

const CONTACT_COLUMNS = [
	{ id: "name", header: "Nombre", width: "w-[28%]", className: "pl-0" },
	{ id: "role", header: "Rol", width: "w-[20%]" },
	{ id: "title", header: "Cargo", width: "w-[22%]" },
	{ id: "email", header: "Email", width: "w-[22%]" },
	{ id: "remove", srLabel: "Quitar", width: "w-10" },
];

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
	month: "short",
	day: "numeric",
	year: "numeric",
};

export function DealSheet({ dealId }: { dealId: string }) {
	const trpc = useTRPC();
	const openRecord = useOpenRecord();
	const {
		tab,
		setTab,
		form: adding,
		setForm: setAdding,
	} = useRecordSheetView("overview");

	const query = useQuery(trpc.deals.byId.queryOptions({ id: dealId }));
	const deal = query.data;

	const tabs: RecordSheetTab[] = [
		{
			value: "overview",
			label: "Resumen",
			content: deal ? <DealOverview deal={deal} /> : null,
		},
		{
			value: "contacts",
			label: "Contactos",
			count: deal?.contacts.length,
			fills: true,
			content: deal ? (
				<DealContacts
					deal={deal}
					adding={adding === "contact"}
					onAdd={() => setAdding("contact")}
					onDone={() => setAdding(null)}
				/>
			) : null,
		},
		{
			value: "activity",
			label: "Actividad",
			fills: true,
			content: deal ? <Timeline anchor={{ dealId: deal.id }} /> : null,
		},
		{
			value: "agent",
			label: "Agente",
			fills: true,
			content: deal ? (
				<AgentPanel record={{ kind: "deal", id: deal.id }} />
			) : null,
			keepMounted: true,
		},
	];

	return (
		<DetailSheetLoaded
			record={
				deal
					? {
							kind: "deal",
							id: deal.id,
							label: deal.name,
							detail: deal.company.name,
							iconUrl: deal.company.iconUrl,
							iconDarkUrl: deal.company.iconDarkUrl,
							iconTone: entityLogoTone.nullable().parse(deal.company.iconTone),
							imageUrl: null,
						}
					: null
			}
		>
			<RecordSheetFrame
				kind="deal"
				loading={query.isPending}
				error={query.error?.message ?? null}
				title={deal?.name ?? "Oportunidad"}
				media={
					deal ? (
						<EntityLogo
							src={deal.company.iconUrl}
							darkSrc={deal.company.iconDarkUrl}
							tone={deal.company.iconTone as EntityLogoTone | null | undefined}
							name={deal.company.name}
							size="sm"
						/>
					) : null
				}
				pills={
					deal ? (
						<>
							<button
								type="button"
								onClick={() =>
									openRecord({ kind: "company", id: deal.company.id })
								}
								className="rounded-sm text-foreground underline-offset-2 outline-none hover:underline focus-visible:shadow-focus"
							>
								{deal.company.name}
							</button>
							{deal.expectedCloseDate ? (
								<span className="text-muted-foreground">
									Cierra <LocalDay date={deal.expectedCloseDate} />
								</span>
							) : null}
						</>
					) : null
				}
				actions={
					deal ? (
						<>
							<DealStageMenu
								dealId={deal.id}
								stage={deal.stage}
								variant="control"
							/>
							<RecordActions
								record={{ kind: "deal", id: deal.id }}
								name={deal.name}
								consequence={`Se eliminan también su historial de etapas, sus notas y las conversaciones con el agente. ${deal.company.name} y ${deal.contacts.length === 1 ? "la persona" : "las personas"} de la oportunidad siguen en el CRM.`}
								archivedAt={deal.archivedAt}
							/>
						</>
					) : null
				}
				rail={deal ? <DealRail deal={deal} /> : null}
				tabs={tabs}
				tab={tab}
				onTabChange={setTab}
			/>
		</DetailSheetLoaded>
	);
}

function DealValue({ deal }: { deal: Deal }) {
	const currency = dealCurrency(deal.currency);
	const converted =
		currency !== deal.reportingCurrency && deal.amountCents !== null;

	return (
		<RecordSection label="Valor">
			<RecordFigure
				value={
					deal.amountCents === null ? (
						<span className="text-muted-foreground">Sin monto</span>
					) : (
						formatMoney(deal.amountCents, currency)
					)
				}
			>
				{converted ? (
					deal.baseAmountCents === null ? (
						<span>
							Sin cotización de {currency}, queda fuera de los totales
						</span>
					) : (
						<span className="tabular-nums">
							Unos {formatMoney(deal.baseAmountCents, deal.reportingCurrency)}{" "}
							en {deal.reportingCurrency}
						</span>
					)
				) : null}
				<span>
					Etapa cambiada <LocalRelativeTime date={deal.stageChangedAt} />
				</span>
			</RecordFigure>
		</RecordSection>
	);
}

function DealOverview({ deal }: { deal: Deal }) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const update = useMutation(
		trpc.deals.update.mutationOptions({
			onSuccess: () => cache.deal(deal.id, { settle: "record" }),
			onError: (error) => toast.error(error.message),
		}),
	);

	const isSaving = savingField(update);

	return (
		<>
			<DealValue deal={deal} />

			<DetailSheetSection title="Etapa">
				<StageStepper dealId={deal.id} stage={deal.stage} />
			</DetailSheetSection>

			<DetailSheetSection title="Descripción">
				<InlineTextArea
					label="Descripción"
					value={deal.description}
					placeholder={`Qué compra ${deal.company.name}, por qué ahora y qué lo frena.`}
					saving={isSaving("description")}
					onSave={(description) =>
						update.mutate({ id: deal.id, data: { description } })
					}
				/>
			</DetailSheetSection>

			<WhereItStands deal={deal} />
		</>
	);
}

function DealRail({ deal }: { deal: Deal }) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const users = useQuery(trpc.users.list.queryOptions());
	const leadSources = useQuery(trpc.leadSources.list.queryOptions());

	const update = useMutation(
		trpc.deals.update.mutationOptions({
			onSuccess: () => cache.deal(deal.id, { settle: "record" }),
			onError: (error) => toast.error(error.message),
		}),
	);

	const saveFields = (fields: Record<string, FieldValueJson>) =>
		update.mutate({ id: deal.id, data: { fields } });

	const isSavingField = savingValue(update);

	const save = (data: Parameters<typeof update.mutate>[0]["data"]) =>
		update.mutate({ id: deal.id, data });

	const currency = dealCurrency(deal.currency);

	const isSaving = savingField(update);

	return (
		<DetailSheetSection title="Detalles" action={<FieldsCog kind="deal" />}>
			<DetailSheetProperties columns={1}>
				<InlineField
					label="Nombre"
					value={deal.name}
					saving={isSaving("name")}
					onSave={(name) => name && save({ name })}
				/>
				<InlineField
					label="Monto"
					value={
						deal.amountCents === null ? null : String(deal.amountCents / 100)
					}
					placeholder="24000"
					saving={isSaving("amountCents")}
					onSave={(next) => {
						if (next === "") return save({ amountCents: null });
						const parsed = Number.parseFloat(next);
						if (!Number.isFinite(parsed) || parsed < 0) {
							toast.error("El monto tiene que ser un número.");
							return;
						}
						save({ amountCents: Math.round(parsed * 100) });
					}}
					render={(value) =>
						formatMoney(Math.round(Number(value) * 100), currency)
					}
				/>
				<InlineSelectField
					label="Moneda"
					value={currency}
					options={currencyOptions(currency)}
					onSave={(currency) => save({ currency })}
				/>
				<ReportedValue deal={deal} />
				<InlineDateField
					label="Fecha de cierre"
					value={deal.expectedCloseDate}
					saving={isSaving("expectedCloseDate")}
					onSave={(next) => save({ expectedCloseDate: next || null })}
				/>
				<InlineCompanyField
					value={deal.company.id}
					company={deal.company}
					saving={isSaving("companyId")}
					onSave={(companyId) => save({ companyId })}
				/>
				<InlineSelectField
					label="Responsable"
					value={deal.owner.id}
					options={(users.data ?? []).map((user) => ({
						value: user.id,
						label: user.name,
					}))}
					onSave={(ownerId) => save({ ownerId })}
				/>
				<InlineSelectField
					label="Origen"
					value={deal.leadSource?.id ?? NONE}
					options={[
						{ value: NONE, label: "Desconocido" },
						...(leadSources.data?.sources ?? [])
							.filter(
								(source) =>
									!source.archived || source.id === deal.leadSource?.id,
							)
							.map((source) => ({ value: source.id, label: source.name })),
					]}
					onSave={(leadSourceId) =>
						save({ leadSourceId: leadSourceId === NONE ? null : leadSourceId })
					}
				/>
				<RecordFields
					fields={deal.fields}
					saving={isSavingField}
					onSave={saveFields}
				/>
			</DetailSheetProperties>
		</DetailSheetSection>
	);
}

function WhereItStands({ deal }: { deal: Deal }) {
	const openRecord = useOpenRecord();

	return (
		<DetailSheetSection title="Cómo va">
			<DetailSheetProperties>
				<DetailSheetProperty label="Abierta">
					<LocalDateTime date={deal.createdAt} options={DATE_OPTIONS} />
				</DetailSheetProperty>

				<DetailSheetProperty label="En la etapa desde">
					<LocalDateTime date={deal.stageChangedAt} options={DATE_OPTIONS} />
				</DetailSheetProperty>

				{deal.closedAt ? (
					<DetailSheetProperty label="Cerrada">
						<LocalDateTime date={deal.closedAt} options={DATE_OPTIONS} />
					</DetailSheetProperty>
				) : null}

				{deal.closedReason ? (
					<DetailSheetProperty label="Motivo" wide>
						{deal.closedReason}
					</DetailSheetProperty>
				) : null}

				<DetailSheetProperty label="Contactos" wide>
					{deal.contacts.length === 0 ? (
						<span className="text-muted-foreground">
							Todavía no hay nadie de {deal.company.name} en la oportunidad.
						</span>
					) : (
						<span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
							{deal.contacts.map((contact) => {
								const aside = contact.role ?? contact.title;
								return (
									<button
										key={contact.id}
										type="button"
										onClick={() =>
											openRecord({ kind: "contact", id: contact.id })
										}
										className="min-w-0 truncate underline-offset-2 hover:underline"
									>
										{contactName(contact)}
										{aside ? (
											<span className="text-muted-foreground"> ({aside})</span>
										) : null}
									</button>
								);
							})}
						</span>
					)}
				</DetailSheetProperty>
			</DetailSheetProperties>
		</DetailSheetSection>
	);
}

function DealContacts({
	deal,
	adding,
	onAdd,
	onDone,
}: {
	deal: Deal;
	adding: boolean;
	onAdd: () => void;
	onDone: () => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const openRecord = useOpenRecord();

	const detach = useMutation(
		trpc.deals.detachContact.mutationOptions({
			onSuccess: () => cache.deal(deal.id, { settle: "record" }),
			onError: (error) => toast.error(error.message),
		}),
	);

	const setRole = useMutation(
		trpc.deals.setContactRole.mutationOptions({
			onSuccess: () => cache.deal(deal.id, { settle: "record" }),
			onError: (error) => toast.error(error.message),
		}),
	);

	const form = adding ? (
		<AttachDealContact
			dealId={deal.id}
			companyName={deal.company.name}
			onDone={onDone}
		/>
	) : null;

	if (deal.contacts.length === 0) {
		return (
			<>
				{form}
				{adding ? null : (
					<DetailSheetEmpty
						icon={UsersIcon}
						title="Sin contactos en esta oportunidad"
						description={`Todavía no hay nadie de ${deal.company.name} en la oportunidad. Suma a las personas a las que les vendes y sabrás a quién darle seguimiento.`}
						action={
							<Button variant="outline" size="sm" onClick={onAdd}>
								<Icon icon={PlusIcon} data-icon="inline-start" />
								Agregar contacto
							</Button>
						}
					/>
				)}
			</>
		);
	}

	return (
		<>
			{form}
			<SimpleTable variant="panel" columns={CONTACT_COLUMNS}>
				{deal.contacts.map((contact) => (
					<SimpleTableRow
						key={contact.id}
						clickable
						onClick={() =>
							openRecord(
								{ kind: "contact", id: contact.id },
								deal.contacts.map((entry) => ({
									kind: "contact",
									id: entry.id,
								})),
							)
						}
					>
						<TableCell className="truncate py-2.5 pr-3 pl-0 font-medium">
							<span className="flex min-w-0 items-center gap-2">
								<PersonAvatar
									src={contact.imageUrl}
									name={contactName(contact)}
									email={contact.email}
									size="sm"
								/>
								<span className="truncate">{contactName(contact)}</span>
							</span>
						</TableCell>
						<TableCell className="truncate px-1 py-2.5">
							<InlineTextCell
								label={`Rol de ${contactName(contact)} en esta oportunidad`}
								value={contact.role}
								placeholder="Decisor"
								saving={
									setRole.isPending &&
									setRole.variables?.contactId === contact.id
								}
								onSave={(role) =>
									setRole.mutate({
										dealId: deal.id,
										contactId: contact.id,
										role: role || null,
									})
								}
							/>
						</TableCell>
						<TableCell className="truncate px-3 py-2.5 text-muted-foreground">
							{contact.title ?? <EmptyCellValue />}
						</TableCell>
						<TableCell className="truncate px-3 py-2.5 text-muted-foreground">
							{contact.email ?? <EmptyCellValue />}
						</TableCell>
						<TableCell className="px-3 py-2.5">
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon-xs"
										disabled={detach.isPending}
										onClick={(event) => {
											event.stopPropagation();
											detach.mutate({
												dealId: deal.id,
												contactId: contact.id,
											});
										}}
									>
										<Icon icon={XIcon} />
										<span className="sr-only">
											Quitar a {contactName(contact)} de esta oportunidad
										</span>
									</Button>
								</TooltipTrigger>
								<TooltipContent>Quitar de esta oportunidad</TooltipContent>
							</Tooltip>
						</TableCell>
					</SimpleTableRow>
				))}

				<AddRow
					label="Agregar contacto"
					columns={CONTACT_COLUMNS.length}
					onClick={onAdd}
				/>
			</SimpleTable>
		</>
	);
}
