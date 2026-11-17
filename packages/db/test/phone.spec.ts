import { describe, expect, it } from "bun:test";
import { isPlausiblePhone, normalizePhone } from "../src/phone";

describe("normalizePhone", () => {
	it("keeps digits and a leading plus", () => {
		expect(normalizePhone("+54 9 351 123-4567")).toBe("+5493511234567");
		expect(normalizePhone("(351) 123 4567")).toBe("3511234567");
	});

	it("drops a plus that is not first", () => {
		expect(normalizePhone("351+123")).toBe("351123");
	});

	it("returns null for blank or digit-free input", () => {
		expect(normalizePhone("")).toBeNull();
		expect(normalizePhone("   ")).toBeNull();
		expect(normalizePhone("+ -")).toBeNull();
	});

	it("gives two spellings of one number the same key", () => {
		expect(normalizePhone("+54 9 351 123 4567")).toBe(
			normalizePhone("+54-9-351-123-4567"),
		);
	});
});

describe("isPlausiblePhone", () => {
	it("accepts blank, so a field can be cleared", () => {
		expect(isPlausiblePhone("")).toBe(true);
	});

	it("accepts 7 to 15 digits", () => {
		expect(isPlausiblePhone("1234567")).toBe(true);
		expect(isPlausiblePhone("+549351123456789")).toBe(true);
	});

	it("rejects too few or too many digits", () => {
		expect(isPlausiblePhone("123456")).toBe(false);
		expect(isPlausiblePhone("1234567890123456")).toBe(false);
	});
});
