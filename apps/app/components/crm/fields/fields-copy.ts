import type { RecordKind } from "@/components/crm/record-sheet/record-stack";
import type { FieldEntity } from "./fields-entity";

export const SHEET_TITLE = "Campos";

const SUBTITLE = {
	company: "Esto define cada empresa en tu CRM.",
	contact: "Esto define cada contacto en tu CRM.",
	deal: "Esto define cada oportunidad en tu CRM.",
} satisfies Record<RecordKind, string>;

export function subtitleFor(kind: RecordKind): string {
	return SUBTITLE[kind];
}

export const STANDARD_ROW = "Campos estándar";
export const STANDARD_NOTE = "solo se pueden reordenar y ocultar";
export const SUGGESTED_ROW = "Campos sugeridos";
export const SUGGESTED_NOTE = "agrégalos con un clic";
export const ADD = "Agregar";
export const CUSTOM_GROUP = "Campos personalizados";
export const DRAG_NOTE = "Arrastra para ordenar";
export const ARCHIVED_ROW = "Archivados";
export const ARCHIVED_NOTE =
	"los valores se conservan y se ocultan en todas partes";
export const NEW_FIELD = "Nuevo campo";
export const ORDER_NOTE = "Este orden es el de la ficha";
export const MANUAL_ONLY = "Solo manual";
export const TABLE_NOTE = "también es una columna de la tabla";
export const FILTER_NOTE = "también es un filtro";

export const EMPTY_TITLE = "Aún no hay campos personalizados";
export const EMPTY_BODY =
	"Crea campos dinámicos que tus agentes puedan investigar y rellenar.";

export const ERROR_TITLE = "No pudimos cargar tus campos";
export const ERROR_BODY =
	"Tus campos siguen ahí. Inténtalo de nuevo en un momento, antes de crear algo nuevo.";
export const RETRY = "Reintentar";

export const LABEL_LABEL = "Etiqueta";
export const KEY_LABEL = "Clave";
export const KEY_HELP =
	"El nombre que usan la API y tus agentes. Se toma de la etiqueta y no cambia una vez guardado. Renombrar la etiqueta nunca rompe una integración.";
export const AGENT_LABEL = "Deja que tus agentes lo rellenen";
export const AGENT_HELP =
	"Proponen un valor con su fuente y nunca sobrescriben el tuyo.";
export const BRIEF_LABEL = "Qué cuenta como respuesta";
export const BRIEF_HELP =
	"Si lo dejas vacío, tus agentes trabajan solo con la etiqueta y el tipo.";
export const TYPE_LABEL = "Tipo";
export const OPTIONS_LABEL = "Opciones";
export const ADD_OPTION = "Agregar opción";
export const ALL_FILLED = "No queda nada por rellenar";

export function optionLabel(index: number): string {
	return `Opción ${index + 1}`;
}
export const ADD_FIELD = "Crear campo";
export const CANCEL = "Cancelar";
export const SAVE = "Guardar cambios";
export const ARCHIVE = "Archivar";
export const FILL_REST = "Rellenar el resto";

const SHEET_PLACEMENT = {
	COMPANY: "Mostrar en la ficha de la empresa",
	CONTACT: "Mostrar en la ficha del contacto",
	DEAL: "Mostrar en la ficha de la oportunidad",
} satisfies Record<FieldEntity, string>;

const TABLE_PLACEMENT = {
	COMPANY: "Ofrecer como columna en la tabla de empresas",
	CONTACT: "Ofrecer como columna en la tabla de contactos",
	DEAL: "Ofrecer como columna en la tabla de oportunidades",
} satisfies Record<FieldEntity, string>;

const FILTER_PLACEMENT = {
	COMPANY: "Ofrecer como filtro en la tabla de empresas",
	CONTACT: "Ofrecer como filtro en la tabla de contactos",
	DEAL: "Ofrecer como filtro en la tabla de oportunidades",
} satisfies Record<FieldEntity, string>;

export function sheetPlacement(entity: FieldEntity): string {
	return SHEET_PLACEMENT[entity];
}

export function tablePlacement(entity: FieldEntity): string {
	return TABLE_PLACEMENT[entity];
}

export function filterPlacement(entity: FieldEntity): string {
	return FILTER_PLACEMENT[entity];
}

export const ENTITY_TABS = [
	{ kind: "company", label: "Empresas" },
	{ kind: "contact", label: "Contactos" },
	{ kind: "deal", label: "Oportunidades" },
] as const satisfies readonly { kind: RecordKind; label: string }[];
