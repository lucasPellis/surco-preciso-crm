type RunFailureReasons = Record<string, string>;

const REASONS: RunFailureReasons = {
	ACTION_NOT_PERFORMED:
		"El agente terminó sin hacer lo que debía. Abre la ejecución para ver qué paso omitió.",
	NO_EXECUTOR:
		"Este agente pide algo que el CRM aún no puede hacer. Hay que reconstruirlo.",
	DEPENDENCY_UNAVAILABLE:
		"Falta una conexión que este agente necesita. Vuelve a conectarla y ejecuta de nuevo.",
	NOT_AUTHORISED:
		"La conexión lo rechazó. Es posible que su acceso se haya revocado o reducido.",
	PROVIDER_ERROR:
		"El servicio externo lo rechazó. Suele valer la pena intentarlo de nuevo.",
	NEVER_SETTLED:
		"El agente se detuvo sin informar un resultado. Nada quedó a medias.",
	TURN_FAILED: "El modelo falló a mitad de esta ejecución.",
	DELIVERY_FAILED: "La ejecución nunca llegó al agente.",
	DELIVERY_EXHAUSTED:
		"Esto nunca llegó al agente tras tres intentos. No se ejecutó nada.",
	ACTION_REJECTED:
		"El agente intentó la acción y el CRM la rechazó. No se escribió nada.",
	AGENT_UNAVAILABLE:
		"El agente estaba pausado o archivado cuando empezó esta ejecución.",
	AGENT_DELETED: "El agente se eliminó antes de que terminara esta ejecución.",
	CANCELLED_BY_USER: "Alguien detuvo esta ejecución.",
	RUN_TIMED_OUT:
		"Esta ejecución tardó demasiado y se detuvo para que pudieran empezar las siguientes.",
};

export function runFailureReason(
	code: string | null | undefined,
	message: string | null | undefined,
): string {
	const known = code ? REASONS[code] : undefined;
	if (known) return known;
	if (message?.trim()) return message.trim();
	return "Esta ejecución falló sin indicar el motivo.";
}
