/**
 * Template loader with content-addressed integrity checking.
 *
 * Text that gets surfaced (prompts, messages, warnings) lives in text files,
 * not hardcoded in TypeScript. Hashes live in hashes.toml — update that file
 * (not TS source) when template content changes.
 *
 * Hash scheme: sha3-256-trunc12 — SHA3-256 of UTF-8 content, first 12 hex chars.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import Bun from "bun";

// Import templates directly via Bun's text import
import bootSequence from "./boot-sequence.md" with { type: "text" };
import ethos from "./ethos.md" with { type: "text" };
import handleTools from "./handle-tools.md" with { type: "text" };
import pressureCritical from "./pressure-critical.md" with { type: "text" };
import pressureHigh from "./pressure-high.md" with { type: "text" };
import pressureMedium from "./pressure-medium.md" with { type: "text" };

const EMBEDDED_TEMPLATES: Record<string, string> = {
	"boot-sequence.md": bootSequence,
	"ethos.md": ethos,
	"handle-tools.md": handleTools,
	"pressure-critical.md": pressureCritical,
	"pressure-high.md": pressureHigh,
	"pressure-medium.md": pressureMedium,
};

// ============================================================================
// Hash registry — loaded from hashes.toml
// ============================================================================

interface HashRegistry {
	scheme: string;
	templates: Record<string, string>;
}

function loadHashRegistry(): HashRegistry {
	const tomlPath = path.join(import.meta.dir, "hashes.toml");
	if (fs.existsSync(tomlPath)) {
		const raw = fs.readFileSync(tomlPath, "utf-8");
		return Bun.TOML.parse(raw) as unknown as HashRegistry;
	}
	// Fallback to hardcoded hashes if toml not found
	return {
		scheme: "sha3-256-trunc12",
		templates: {
			"boot-sequence.md": "0ea8fcf4dcf8",
			"ethos.md": "40324520911e",
			"handle-tools.md": "ee345e32ddd8",
			"pressure-critical.md": "270921f45b87",
			"pressure-high.md": "11fc4c620d88",
			"pressure-medium.md": "c298504d8af1",
		},
	};
}

const HASH_REGISTRY: HashRegistry = loadHashRegistry();

// ============================================================================
// Hashing
// ============================================================================

/**
 * Hash content with SHA3-256, return first 12 hex chars.
 * Matches scheme = "sha3-256-trunc12" in hashes.toml.
 */
export function hashContent(content: string): string {
	const hasher = new Bun.CryptoHasher("sha3-256");
	hasher.update(content);
	return hasher.digest("hex").slice(0, 12);
}

// ============================================================================
// Loaders
// ============================================================================

/**
 * Load a template and verify its hash against hashes.toml.
 *
 * @param filename - Template name (must be in hashes.toml)
 * @returns The template content
 * @throws If hash doesn't match (content changed — update hashes.toml after review)
 * @throws If filename not found in registry
 */
export function loadTemplate(filename: string): string {
	const expectedHash = HASH_REGISTRY.templates[filename];
	if (!expectedHash) {
		throw new Error(`Template "${filename}" not found in hashes.toml.\nRun: bun scripts/update-prompt-hashes.ts`);
	}

	const content = EMBEDDED_TEMPLATES[filename];
	if (content === undefined) {
		throw new Error(`Template "${filename}" not found in embedded templates.`);
	}

	const actualHash = hashContent(content);

	if (actualHash !== expectedHash) {
		throw new Error(
			`Template hash mismatch for ${filename}:\n` +
				`  Expected : ${expectedHash}\n` +
				`  Actual   : ${actualHash}\n` +
				`\n` +
				`The file changed. Review the diff, then run:\n` +
				`  bun scripts/update-prompt-hashes.ts\n`,
		);
	}

	return content;
}

/**
 * Load template without hash check (for development/initial setup).
 * Prints the hash so you can add it to hashes.toml.
 */
export function loadTemplateUnchecked(filename: string): { content: string; hash: string } {
	const content = EMBEDDED_TEMPLATES[filename];
	if (content === undefined) {
		throw new Error(`Template "${filename}" not found in embedded templates.`);
	}
	const hash = hashContent(content);
	console.log(`Template ${filename} hash: ${hash}`);
	return { content, hash };
}
