import { describe, expect, it } from "bun:test";
import {
	isLeadSourceIcon,
	LEAD_SOURCE_ICONS,
	leadSourceKey,
} from "../src/lead-source";

describe("isLeadSourceIcon", () => {
	it("accepts every icon in the catalog", () => {
		for (const icon of LEAD_SOURCE_ICONS) {
			expect(isLeadSourceIcon(icon)).toBe(true);
		}
	});

	it("refuses anything else", () => {
		expect(isLeadSourceIcon("tiktok-ads")).toBe(false);
		expect(isLeadSourceIcon("")).toBe(false);
	});
});

describe("leadSourceKey", () => {
	it("lowercases and joins words with a dash", () => {
		expect(leadSourceKey("Google Ads")).toBe("google-ads");
	});

	it("drops accents", () => {
		expect(leadSourceKey("Feria o evento")).toBe("feria-o-evento");
		expect(leadSourceKey("Exposición Rural")).toBe("exposicion-rural");
	});

	it("trims stray separators", () => {
		expect(leadSourceKey("  --Referido!! ")).toBe("referido");
	});

	it("returns an empty key for a name with no letters or digits", () => {
		expect(leadSourceKey("!!!")).toBe("");
	});
});
