import { describe, expect, it } from "bun:test";
import { normalizeSku, PRODUCT } from "../src/product";

describe("normalizeSku", () => {
	it("trims and upper-cases", () => {
		expect(normalizeSku("  ab-12  ")).toBe("AB-12");
	});

	it("joins inner spaces with a dash", () => {
		expect(normalizeSku("ab 12   cd")).toBe("AB-12-CD");
	});

	it("keeps an already clean sku", () => {
		expect(normalizeSku("XR-500")).toBe("XR-500");
	});
});

describe("PRODUCT limits", () => {
	it("are positive integers", () => {
		for (const value of Object.values(PRODUCT)) {
			expect(Number.isInteger(value)).toBe(true);
			expect(value).toBeGreaterThan(0);
		}
	});
});
