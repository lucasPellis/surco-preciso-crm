"use client";

import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { cn } from "@crm/ui/lib/utils";
import {
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	pointerWithin,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { GripVerticalIcon } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { type ReactNode, useState } from "react";

export function PipelineBoard({
	label,
	onMove,
	overlay,
	children,
}: {
	label: string;
	onMove: (cardId: string, columnId: string) => void;
	overlay: (cardId: string) => ReactNode;
	children: ReactNode;
}) {
	const reduced = useReducedMotion() === true;
	const [activeId, setActiveId] = useState<string | null>(null);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
		useSensor(KeyboardSensor),
	);

	const onDragStart = (event: DragStartEvent) => {
		setActiveId(String(event.active.id));
	};

	const onDragEnd = (event: DragEndEvent) => {
		setActiveId(null);
		if (!event.over) return;
		onMove(String(event.active.id), String(event.over.id));
	};

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={pointerWithin}
			onDragStart={onDragStart}
			onDragEnd={onDragEnd}
			onDragCancel={() => setActiveId(null)}
		>
			<section
				aria-label={label}
				className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2"
			>
				{children}
			</section>
			<DragOverlay dropAnimation={reduced ? null : undefined}>
				{activeId ? overlay(activeId) : null}
			</DragOverlay>
		</DndContext>
	);
}

export function PipelineColumn({
	id,
	title,
	count,
	summary,
	children,
}: {
	id: string;
	title: string;
	count: number;
	summary?: ReactNode;
	children: ReactNode;
}) {
	const { setNodeRef, isOver } = useDroppable({ id });

	return (
		<div
			ref={setNodeRef}
			className={cn(
				"flex min-h-0 w-72 shrink-0 flex-col gap-2 rounded-lg bg-muted p-2 transition-colors",
				isOver && "bg-accent",
			)}
		>
			<header className="flex items-baseline justify-between gap-2 px-1.5 pt-1">
				<h2 className="truncate font-medium text-sm">{title}</h2>
				<span className="text-13 text-muted-foreground tabular-nums">
					{count}
				</span>
			</header>
			{summary ? (
				<p className="px-1.5 text-13 text-muted-foreground tabular-nums">
					{summary}
				</p>
			) : null}
			<ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
				{children}
			</ul>
		</div>
	);
}

export function PipelineCard({
	id,
	label,
	children,
}: {
	id: string;
	label: string;
	children: ReactNode;
}) {
	const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } =
		useDraggable({ id });

	return (
		<li
			ref={setNodeRef}
			className={cn(
				"flex items-start gap-1 rounded-md bg-card p-2 text-card-foreground text-sm shadow-border",
				isDragging && "opacity-40",
			)}
		>
			<Button
				ref={setActivatorNodeRef}
				type="button"
				variant="ghost"
				size="icon-xs"
				className="cursor-grab text-muted-foreground"
				{...attributes}
				{...listeners}
			>
				<Icon icon={GripVerticalIcon} motion="none" />
				<span className="sr-only">Mover {label}</span>
			</Button>
			<div className="min-w-0 flex-1">{children}</div>
		</li>
	);
}

export function PipelineCardPreview({ children }: { children: ReactNode }) {
	return (
		<div className="rounded-md bg-card p-2 text-card-foreground text-sm shadow-menu">
			{children}
		</div>
	);
}
