"use client";

import { ChatSuggestions } from "@crm/ui/components/chat-thread";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { adoptChatUrl } from "@/lib/chat-route";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { AgentComposer, type BuilderComposerPrompt } from "./agent-composer";

const SUGGESTIONS = [
	"Brief every deal owner before a renewal call",
	"Flag deals with no activity for 14 days",
	"Hand new customers from Sales to Onboarding",
];

export function AgentBuilderHome({ name }: { name: string }) {
	const workspaceUrl = useWorkspaceUrl();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [initialPrompt, setInitialPrompt] = useState("");
	const create = useMutation(
		trpc.conversations.createBuilder.mutationOptions({
			onSuccess: async ({ id }) => {
				await queryClient.invalidateQueries({
					queryKey: trpc.conversations.builderList.pathKey(),
				});
				adoptChatUrl(window.history, workspaceUrl(`/chat/${id}`));
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const submit = async (
		prompt: BuilderComposerPrompt,
		clientRequestId: string,
	) => {
		await create.mutateAsync({
			...prompt,
			clientRequestId,
		});
	};

	return (
		<main className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 pt-14 pb-20 sm:px-6 sm:pt-12 sm:pb-28">
			<div className="flex w-full max-w-3xl flex-col items-center gap-3 pb-6 text-center">
				<h1 className="text-balance font-medium text-2xl tracking-tight sm:text-3xl">
					¿En qué te puedo ayudar, {firstName(name)}?
				</h1>
				<p className="max-w-xl text-balance text-muted-foreground text-sm">
					Pregunta sobre tu CRM, menciona un registro o una integración, o
					describe un agente para automatizar una tarea.
				</p>
			</div>

			<div className="w-full max-w-3xl">
				<AgentComposer
					key={initialPrompt}
					mode="home"
					initialPrompt={initialPrompt}
					onSubmit={submit}
				/>
				<p className="flex h-8 items-center px-px text-muted-foreground text-xs">
					Los chats y borradores de agentes son privados. Al desplegar un
					agente, queda disponible para todo el equipo.
				</p>

				<ChatSuggestions
					label="Agentes sugeridos"
					suggestions={SUGGESTIONS}
					onSelect={(suggestion) =>
						setInitialPrompt(`/Create agent ${suggestion}`)
					}
				/>
			</div>
		</main>
	);
}

function firstName(name: string): string {
	return name.trim().split(/\s+/)[0] || "ahí";
}
