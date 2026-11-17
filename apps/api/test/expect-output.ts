import type { z } from "zod";

export function expectOutput<Schema extends z.ZodType>(
	schema: Schema,
	value: z.input<Schema>,
): z.output<Schema> {
	return schema.parse(value);
}
