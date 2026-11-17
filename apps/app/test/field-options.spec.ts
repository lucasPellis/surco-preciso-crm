import { describe, expect, test } from "bun:test";
import {
	addOption,
	cleanOptions,
	hasDuplicates,
	normalizeLabel,
	optionsChanged,
	removeOption,
	renameOption,
} from "@/lib/field-options";

const CASH = { id: "a", label: "Contado" };
const CHEQUE = { id: "b", label: "Cheque" };
const BASE = [CASH, CHEQUE];

describe("field options", () => {
	test("normalizes spaces", () => {
		expect(normalizeLabel("  No   sabe ")).toBe("No sabe");
	});

	test("adds a new option without id", () => {
		expect(addOption(BASE, " Financiado ")).toEqual([
			...BASE,
			{ label: "Financiado" },
		]);
	});

	test("ignores empty and case-insensitive duplicates", () => {
		expect(addOption(BASE, "   ")).toBe(BASE);
		expect(addOption(BASE, "cheque")).toBe(BASE);
	});

	test("renames keeping the id", () => {
		expect(renameOption(BASE, 0, "Efectivo")[0]).toEqual({
			id: "a",
			label: "Efectivo",
		});
	});

	test("removes by index", () => {
		expect(removeOption(BASE, 0)).toEqual([CHEQUE]);
	});

	test("cleans blanks and duplicates, keeps the first", () => {
		expect(
			cleanOptions([...BASE, { label: " " }, { label: "CONTADO" }]),
		).toEqual(BASE);
	});

	test("detects duplicates after a rename", () => {
		expect(hasDuplicates(renameOption(BASE, 0, "cheque"))).toBe(true);
		expect(hasDuplicates(BASE)).toBe(false);
	});

	test("detects changes", () => {
		expect(optionsChanged(BASE, [...BASE])).toBe(false);
		expect(optionsChanged(BASE, [CHEQUE, CASH])).toBe(true);
		expect(optionsChanged(BASE, renameOption(BASE, 1, "x"))).toBe(true);
	});
});
