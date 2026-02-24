/**
 * Template loader with content-addressed integrity checking.
 * 
 * Text that gets surfaced (prompts, messages, warnings) lives in text files,
 * not hardcoded in TypeScript. The loader verifies hash at each use site,
 * forcing review when content changes.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// In dist, we're at dist/core/prompts/loader.js, prompts are copied to dist/core/prompts/
// In src, we're at src/core/prompts/loader.ts, prompts are at src/core/prompts/
const PROMPTS_DIR = __dirname;

/**
 * Hash content with SHA3-256, return first 12 hex chars.
 */
export function hashContent(content: string): string {
	return createHash("sha3-256").update(content).digest("hex").slice(0, 12);
}

/**
 * Load a template file and verify its hash.
 * 
 * @param filename - File in prompts/ directory
 * @param expectedHash - First 12 hex chars of SHA3-256 hash
 * @returns The template content
 * @throws If hash doesn't match (forces review at use site)
 */
export function loadTemplate(filename: string, expectedHash: string): string {
	const filepath = join(PROMPTS_DIR, filename);
	const content = readFileSync(filepath, "utf-8");
	const actualHash = hashContent(content);
	
	if (actualHash !== expectedHash) {
		throw new Error(
			`Template hash mismatch for ${filename}:\n` +
			`  Expected: ${expectedHash}\n` +
			`  Actual:   ${actualHash}\n` +
			`Content changed - update the hash at the use site after review.`
		);
	}
	
	return content;
}

/**
 * Load template without hash check (for development/initial setup).
 * Logs the hash so you can add it to the use site.
 */
export function loadTemplateUnchecked(filename: string): { content: string; hash: string } {
	const filepath = join(PROMPTS_DIR, filename);
	const content = readFileSync(filepath, "utf-8");
	const hash = hashContent(content);
	console.log(`Template ${filename} hash: ${hash}`);
	return { content, hash };
}
