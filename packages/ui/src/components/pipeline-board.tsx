"use client";

import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { PIPELINE_BOARD } from "@crm/ui/lib/pipeline-board-config";
import { columnTargetX } from "@crm/ui/lib/pipeline-board-keyboard";
import { cn } from "@crm/ui/lib/utils";
import {
	type Announcements,
	type CollisionDetection,
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	type KeyboardCoordinateGetter,
	KeyboardSensor,
	MouseSensor,
	pointerWithin,
	rectIntersection,
	TouchSensor,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { GripVerticalIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

const { copy } = PIPELINE_BOARD;

const collisionDetection: CollisionDetection = (args) =>
	args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args);

const keyboardCoordinates: KeyboardCoordinateGetter = (
	event,
	{
		context: { collisionRect, droppableRects, droppableContainers },
		currentCoordinates,
	},
) => {
	const step = PIPELINE_BOARD.keyboardStep.get(event.code);
	if (step === undefined || !collisionRect) return undefined;
	event.preventDefault();
	const columns = droppableContainers.getEnabled().flatMap((container) => {
		const rect = droppableRects.get(container.id);
		return rect ? [rect] : [];
	});
	const x = columnTargetX(columns, collisionRect, step);
	return x === undefined ? undefined : { x, y: currentCoordinates.y };
};

function dataText(
	source: { data: { current?: Record<string, unknown> } },
	key: string,
) {
	const value = source.data.current?.[key];
	return typeof value === "string" ? value : "";
}

const announcements: Announcements = {
	onDragStart: ({ active }) => copy.picked(dataText(active, "label")),
	onDragOver: ({ active, over }) =>
		over
			? copy.over(dataText(active, "label"), dataText(over, "title"))
			: undefined,
	onDragEnd: ({ active, over }) =>
		over
			? copy.dropped(dataText(active, "label"), dataText(over, "title"))
			: copy.returned(dataText(active, "label")),
	onDragCancel: ({ active }) => copy.cancelled(dataText(active, "label")),
};

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
	const [activeId, setActiveId] = useState<string | null>(null);

	const sensors = useSensors(
		useSensor(MouseSensor, {
			activationConstraint: { distance: PIPELINE_BOARD.drag.mouseDistancePx },
		}),
		useSensor(TouchSensor, {
			activationConstraint: {
				delay: PIPELINE_BOARD.drag.touchDelayMs,
				tolerance: PIPELINE_BOARD.drag.touchTolerancePx,
			},
		}),
		useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }),
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
			collisionDetection={collisionDetection}
			accessibility={{
				announcements,
				screenReaderInstructions: { draggable: copy.instructions },
			}}
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
			<DragOverlay dropAnimation={null}>
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
	const { setNodeRef, isOver } = useDroppable({ id, data: { title } });

	return (
		<div
			ref={setNodeRef}
			className={cn(
				"flex min-h-0 flex-col gap-2 rounded-lg bg-muted p-2 transition-colors",
				PIPELINE_BOARD.column,
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
		useDraggable({
			id,
			data: { label },
			attributes: { roleDescription: copy.roleDescription },
		});

	return (
		<li
			ref={setNodeRef}
			{...listeners}
			className={cn(
				"flex cursor-grab items-start gap-1 rounded-md bg-card p-2 text-card-foreground text-sm shadow-border",
				isDragging && "opacity-40",
			)}
		>
			<Button
				ref={setActivatorNodeRef}
				type="button"
				variant="ghost"
				size="icon-xs"
				className="text-muted-foreground"
				{...attributes}
			>
				<Icon icon={GripVerticalIcon} motion="none" />
				<span className="sr-only">{copy.move(label)}</span>
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
