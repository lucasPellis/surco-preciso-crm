"use client";

import { Button } from "@crm/ui/components/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@crm/ui/components/collapsible";
import { Icon } from "@crm/ui/components/icon";
import { Link } from "@crm/ui/components/link";
import { ChevronRightIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { CopyValue } from "@/app/(app)/[slug]/settings/copy-value";
import { contactName } from "@/components/crm/contact-name";
import { RecordFields } from "@/components/crm/fields/record-fields";
import { ActivityComposer } from "@/components/crm/timeline/activity-composer";
import {
	DetailSheetProperties,
	DetailSheetSection,
} from "@/components/detail-sheet";
import { orderContacts, splitQualification } from "@/lib/deal-sheet";
import { DEAL_SHEET } from "@/lib/deal-sheet-config";
import { idleLabel } from "@/lib/deal-stage";
import { taskLine } from "@/lib/funnel-card";
import type { RouterOutputs } from "@/lib/trpc/types";
import { AttachDealContact } from "./quick-add";
import { useOpenRecord } from "./record-stack";

type Deal = RouterOutputs["deals"]["byId"];

const { copy } = DEAL_SHEET;

export function DealNextStep({ deal }: { deal: Deal }) {
	const [adding, setAdding] = useState(false);
	const line = deal.nextTask ? taskLine(deal.nextTask) : null;

	return (
		<DetailSheetSection title={copy.nextStep.title}>
			<div className="flex flex-col gap-2">
				{line ? (
					<span className="flex min-w-0 items-baseline gap-2 text-sm">
						<span
							className={
								line.overdue
									? "shrink-0 text-destructive"
									: "shrink-0 text-muted-foreground"
							}
						>
							{line.hint}
						</span>
						<span className="truncate font-medium">{line.title}</span>
					</span>
				) : adding ? null : (
					<span className="text-muted-foreground text-sm">
						{copy.nextStep.none}
					</span>
				)}

				{deal.idleHours === null ? null : (
					<span className="text-13 text-status-warning-text">
						{idleLabel(deal.idleHours)}
					</span>
				)}

				{adding ? (
					<>
						<ActivityComposer anchor={{ dealId: deal.id }} fixedType="TASK" />
						<Button
							variant="ghost"
							size="sm"
							className="self-start"
							onClick={() => setAdding(false)}
						>
							{copy.nextStep.close}
						</Button>
					</>
				) : line ? null : (
					<Button
						variant="outline"
						size="sm"
						className="self-start"
						onClick={() => setAdding(true)}
					>
						<Icon icon={PlusIcon} data-icon="inline-start" />
						{copy.nextStep.add}
					</Button>
				)}
			</div>
		</DetailSheetSection>
	);
}

export function DealQualification({
	deal,
	saving,
	onSave,
}: {
	deal: Deal;
	saving: (key: string) => boolean;
	onSave: React.ComponentProps<typeof RecordFields>["onSave"];
}) {
	const { questions, answered, total, complete } = splitQualification(
		deal.fields,
	);

	if (total === 0) return null;

	return (
		<Collapsible defaultOpen={!complete}>
			<DetailSheetSection
				title={
					<CollapsibleTrigger asChild>
						<button
							type="button"
							className="group/qualification flex items-center gap-1.5 rounded-sm outline-none focus-visible:shadow-focus"
						>
							<Icon
								icon={ChevronRightIcon}
								className="transition-transform group-data-[state=open]/qualification:rotate-90"
							/>
							{copy.qualification.title(answered, total)}
						</button>
					</CollapsibleTrigger>
				}
			>
				<CollapsibleContent>
					<div className="flex flex-col gap-1 [--property-label:14rem]">
						<DetailSheetProperties columns={1}>
							<RecordFields
								fields={questions}
								saving={saving}
								onSave={onSave}
							/>
						</DetailSheetProperties>
					</div>
				</CollapsibleContent>
			</DetailSheetSection>
		</Collapsible>
	);
}

export function DealContactCard({ deal }: { deal: Deal }) {
	const openRecord = useOpenRecord();
	const [adding, setAdding] = useState(false);
	const contacts = orderContacts(deal.contacts, deal.company.primaryContactId);

	return (
		<DetailSheetSection title={copy.contact.title}>
			<div className="flex flex-col gap-3">
				{contacts.length === 0 && !adding ? (
					<span className="text-muted-foreground text-sm">
						{copy.contact.none}
					</span>
				) : null}

				{contacts.map((contact) => (
					<div key={contact.id} className="flex min-w-0 flex-col gap-0.5">
						<span className="flex min-w-0 items-baseline gap-2">
							<button
								type="button"
								onClick={() => openRecord({ kind: "contact", id: contact.id })}
								className="min-w-0 truncate font-medium text-sm underline-offset-2 hover:underline"
							>
								{contactName(contact)}
							</button>
							{contact.id === deal.company.primaryContactId ? (
								<span className="text-13 text-muted-foreground">
									{copy.contact.primary}
								</span>
							) : contact.role ? (
								<span className="truncate text-13 text-muted-foreground">
									{contact.role}
								</span>
							) : null}
						</span>
						{contact.phone ? (
							<span className="flex items-center gap-1">
								<Link
									variant="quiet"
									href={`tel:${contact.phone}`}
									className="truncate text-13 tabular-nums"
								>
									{contact.phone}
								</Link>
								<CopyValue value={contact.phone} label={copy.contact.phone} />
							</span>
						) : null}
						{contact.email ? (
							<span className="flex items-center gap-1">
								<Link
									variant="quiet"
									href={`mailto:${contact.email}`}
									className="truncate text-13"
								>
									{contact.email}
								</Link>
								<CopyValue value={contact.email} label={copy.contact.email} />
							</span>
						) : null}
					</div>
				))}

				{adding ? (
					<AttachDealContact
						dealId={deal.id}
						companyName={deal.company.name}
						onDone={() => setAdding(false)}
					/>
				) : (
					<Button
						variant="ghost"
						size="sm"
						className="self-start"
						onClick={() => setAdding(true)}
					>
						<Icon icon={PlusIcon} data-icon="inline-start" />
						{copy.contact.add}
					</Button>
				)}
			</div>
		</DetailSheetSection>
	);
}
