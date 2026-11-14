"use client";

import {
	Alert,
	AlertAction,
	AlertDescription,
	AlertTitle,
} from "@crm/ui/components/alert";
import { Button } from "@crm/ui/components/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@crm/ui/components/collapsible";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@crm/ui/components/field";
import {
	FormSheet,
	FormSheetContent,
	FormSheetFooter,
	FormSheetForm,
	useFormSheetValidation,
} from "@crm/ui/components/form-sheet";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { LeadSourcePicker } from "@crm/ui/components/lead-source-picker";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import {
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@crm/ui/components/sheet";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDownIcon, PlusIcon } from "lucide-react";
import { parseAsBoolean, useQueryState } from "nuqs";
import { type ComponentProps, Suspense, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { CompanyPicker } from "@/components/crm/company-picker";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const NONE = "none";
const PHONE_OR_EMAIL = "Hace falta un teléfono o un email.";

type Duplicate = { contactId: string; name: string; dealId: string | null };

function AddButton(props: ComponentProps<typeof Button>) {
	return (
		<Button {...props}>
			<Icon icon={PlusIcon} data-icon="inline-start" />
			Nuevo lead
		</Button>
	);
}

export function CreateLeadSheet() {
	return (
		<Suspense fallback={<AddButton disabled />}>
			<CreateLeadForm />
		</Suspense>
	);
}

function CreateLeadForm() {
	const openRecord = useOpenRecord();
	const validation = useFormSheetValidation();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const queryClient = useQueryClient();

	const [open, setOpen] = useQueryState(
		SEARCH_PARAM.dialog.create,
		parseAsBoolean.withDefault(false),
	);
	const [phone, setPhone] = useState("");
	const [firstName, setFirstName] = useState("");
	const [leadSourceId, setLeadSourceId] = useState("");
	const [lastName, setLastName] = useState("");
	const [email, setEmail] = useState("");
	const [title, setTitle] = useState("");
	const [company, setCompany] = useState(NONE);
	const [ownerId, setOwnerId] = useState(NONE);
	const [originDetail, setOriginDetail] = useState("");
	const [moreOpen, setMoreOpen] = useState(false);
	const [duplicate, setDuplicate] = useState<Duplicate | null>(null);

	const addAnother = useRef(false);
	const phoneInput = useRef<HTMLInputElement>(null);

	const phoneId = useId();
	const firstNameId = useId();
	const lastNameId = useId();
	const emailId = useId();
	const titleId = useId();
	const originDetailId = useId();

	const users = useQuery(trpc.users.list.queryOptions());
	const leadSources = useQuery(trpc.leadSources.list.queryOptions());
	const activeSources = (leadSources.data?.sources ?? []).filter(
		(source) => !source.archived,
	);

	const reset = () => {
		validation.reset();
		setPhone("");
		setFirstName("");
		setLeadSourceId("");
		setLastName("");
		setEmail("");
		setTitle("");
		setCompany(NONE);
		setOwnerId(NONE);
		setOriginDetail("");
		setMoreOpen(false);
		setDuplicate(null);
	};

	const create = useMutation(
		trpc.contacts.create.mutationOptions({
			onSuccess: async (lead) => {
				await cache.contact(lead.id);
				const dealId = lead.dealId;
				toast.success(
					`${[lead.firstName, lead.lastName].filter(Boolean).join(" ")} entró al funnel en Nuevo.`,
					dealId
						? {
								description: "Se creó una tarea de seguimiento para hoy.",
								action: {
									label: "Ver oportunidad",
									onClick: () => openRecord({ kind: "deal", id: dealId }),
								},
							}
						: undefined,
				);
				reset();
				if (addAnother.current) {
					phoneInput.current?.focus();
					return;
				}
				await setOpen(null);
			},
			onError: async (error, variables) => {
				if (error.data?.code !== "CONFLICT") {
					toast.error(error.message);
					return;
				}
				const found = await queryClient.fetchQuery({
					...trpc.contacts.findDuplicate.queryOptions({
						phone: variables.phone,
						email: variables.email,
					}),
					staleTime: 0,
				});
				if (found) setDuplicate(found);
				else toast.error(error.message);
			},
		}),
	);

	const openExisting = async (existing: Duplicate) => {
		await setOpen(null);
		reset();
		openRecord(
			existing.dealId
				? { kind: "deal", id: existing.dealId }
				: { kind: "contact", id: existing.contactId },
		);
	};

	return (
		<FormSheet
			dirty={
				phone !== "" ||
				firstName !== "" ||
				leadSourceId !== "" ||
				lastName !== "" ||
				email !== "" ||
				title !== "" ||
				company !== NONE ||
				ownerId !== NONE ||
				originDetail !== ""
			}
			pending={create.isPending}
			onDiscard={reset}
			open={open}
			onOpenChange={(next) => setOpen(next || null)}
		>
			<SheetTrigger asChild>
				<AddButton />
			</SheetTrigger>
			<FormSheetContent side="right">
				<SheetHeader>
					<SheetTitle>Nuevo lead</SheetTitle>
					<SheetDescription>
						Se crea el contacto, una oportunidad en Nuevo y una tarea de
						seguimiento para hoy. Sin empresa, se crea una con el nombre de la
						persona.
					</SheetDescription>
				</SheetHeader>

				<FormSheetForm
					noValidate
					onInput={validation.onInput}
					id="create-lead"
					onSubmit={(event) => {
						event.preventDefault();
						const unreachable = phone.trim() === "" && email.trim() === "";
						const missing = unreachable ? { [phoneId]: PHONE_OR_EMAIL } : {};
						if (!validation.validate(event.currentTarget, missing)) return;
						create.mutate({
							firstName,
							lastName: lastName || undefined,
							email: email || undefined,
							phone: phone || undefined,
							title: title || undefined,
							companyId: company === NONE ? null : company,
							ownerId: ownerId === NONE ? null : ownerId,
							leadSourceId: leadSourceId || null,
							originDetail: originDetail || undefined,
						});
					}}
				>
					{duplicate ? (
						<Alert variant="warning">
							<AlertTitle>Este lead ya existe</AlertTitle>
							<AlertDescription>
								{duplicate.name} ya usa ese teléfono o email.
							</AlertDescription>
							<AlertAction>
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={() => openExisting(duplicate)}
								>
									Abrir lead
								</Button>
							</AlertAction>
						</Alert>
					) : null}

					<Field data-invalid={!!validation.errors[phoneId]}>
						<FieldLabel htmlFor={phoneId}>Teléfono</FieldLabel>
						<Input
							id={phoneId}
							ref={phoneInput}
							aria-invalid={!!validation.errors[phoneId]}
							aria-describedby={
								validation.errors[phoneId] ? `${phoneId}-error` : undefined
							}
							type="tel"
							value={phone}
							onChange={(event) => {
								setPhone(event.target.value);
								setDuplicate(null);
							}}
							placeholder="+54 9 11 2345 6789"
							autoComplete="off"
						/>
						<FieldError id={`${phoneId}-error`}>
							{validation.errors[phoneId]}
						</FieldError>
					</Field>

					<Field data-invalid={!!validation.errors[firstNameId]}>
						<FieldLabel htmlFor={firstNameId}>Nombre</FieldLabel>
						<Input
							id={firstNameId}
							aria-invalid={!!validation.errors[firstNameId]}
							aria-describedby={
								validation.errors[firstNameId]
									? `${firstNameId}-error`
									: undefined
							}
							value={firstName}
							onChange={(event) => setFirstName(event.target.value)}
							autoComplete="off"
							pattern=".*\S.*"
							required
						/>
						<FieldError id={`${firstNameId}-error`}>
							{validation.errors[firstNameId]}
						</FieldError>
					</Field>

					<FieldSet>
						<FieldLegend variant="label">Origen</FieldLegend>
						<LeadSourcePicker
							label="Origen"
							sources={activeSources}
							value={leadSourceId}
							onValueChange={setLeadSourceId}
						/>
						<FieldDescription>
							Si no se conoce, queda como Desconocido.
						</FieldDescription>
					</FieldSet>

					<Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
						<CollapsibleTrigger asChild>
							<Button type="button" variant="ghost" size="sm">
								Más datos
								<Icon icon={ChevronDownIcon} data-icon="inline-end" />
							</Button>
						</CollapsibleTrigger>
						<CollapsibleContent>
							<Field data-invalid={!!validation.errors[lastNameId]}>
								<FieldLabel htmlFor={lastNameId}>Apellido</FieldLabel>
								<Input
									id={lastNameId}
									value={lastName}
									onChange={(event) => setLastName(event.target.value)}
									autoComplete="off"
								/>
							</Field>

							<Field data-invalid={!!validation.errors[emailId]}>
								<FieldLabel htmlFor={emailId}>Email</FieldLabel>
								<Input
									id={emailId}
									aria-invalid={!!validation.errors[emailId]}
									aria-describedby={
										validation.errors[emailId] ? `${emailId}-error` : undefined
									}
									type="email"
									value={email}
									onChange={(event) => {
										setEmail(event.target.value);
										setDuplicate(null);
									}}
									autoComplete="off"
								/>
								<FieldError id={`${emailId}-error`}>
									{validation.errors[emailId]}
								</FieldError>
							</Field>

							<Field>
								<FieldLabel htmlFor={titleId}>Cargo</FieldLabel>
								<Input
									id={titleId}
									value={title}
									onChange={(event) => setTitle(event.target.value)}
									placeholder="Gerente de campo"
									autoComplete="off"
								/>
							</Field>

							<Field>
								<FieldLabel htmlFor="create-lead-company">Empresa</FieldLabel>
								<CompanyPicker
									id="create-lead-company"
									value={company}
									onValueChange={setCompany}
									none={{ value: NONE, label: "Sin empresa" }}
								/>
							</Field>

							<Field>
								<FieldLabel htmlFor="create-lead-owner">Responsable</FieldLabel>
								<Select value={ownerId} onValueChange={setOwnerId}>
									<SelectTrigger id="create-lead-owner">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={NONE}>Yo (quien lo crea)</SelectItem>
										{(users.data ?? []).map((user) => (
											<SelectItem key={user.id} value={user.id}>
												{user.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>

							<Field>
								<FieldLabel htmlFor={originDetailId}>
									Detalle del origen
								</FieldLabel>
								<Input
									id={originDetailId}
									value={originDetail}
									onChange={(event) => setOriginDetail(event.target.value)}
									placeholder="Campaña, feria o quién lo refirió"
									autoComplete="off"
								/>
							</Field>
						</CollapsibleContent>
					</Collapsible>
				</FormSheetForm>

				<FormSheetFooter>
					<Button
						type="submit"
						form="create-lead"
						variant="outline"
						disabled={create.isPending}
						onClick={() => {
							addAnother.current = true;
						}}
					>
						Guardar y agregar otro
					</Button>
					<Button
						type="submit"
						form="create-lead"
						disabled={create.isPending}
						onClick={() => {
							addAnother.current = false;
						}}
					>
						{create.isPending ? <Spinner data-icon="inline-start" /> : null}
						Agregar lead
					</Button>
				</FormSheetFooter>
			</FormSheetContent>
		</FormSheet>
	);
}
