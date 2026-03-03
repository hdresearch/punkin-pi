/**
 * CarterKit Squiggle Tools — structured reasoning demarcation.
 *
 * Model calls squiggle_open at start of reasoning, squiggle_close at end.
 * Harness tracks content between, computes hash and duration.
 *
 * These are NOT push-down handle tools — they're reasoning protocol tools.
 */

import { createHash } from "crypto";
import type { AgentTool } from "@punkin-pi/agent-core";
import { Type } from "@sinclair/typebox";
import { now, type Timestamp } from "@punkin-pi/ai";
import type { SquiggleOpenResult, SquiggleCloseResult } from "@punkin-pi/ai";

// ============================================================================
// Squiggle Flavors (from reasoning-visibly skill)
// ============================================================================

const SQUIGGLE_FLAVORS = [
	{ name: "XML", open: "<squiggle>", close: "</squiggle>" },
	{ name: "Bracket", open: "<[squiggle]>", close: "</[squiggle]>" },
	{ name: "Double angle", open: "<<squiggle>>", close: "<</squiggle>>" },
	{ name: "Paren", open: "((squiggle))", close: "((/squiggle))" },
	{ name: "Brace", open: "{squiggle}", close: "{/squiggle}" },
	{ name: "Double brace", open: "{{squiggle}}", close: "{{/squiggle}}" },
	{ name: "Guillemet", open: "«squiggle»", close: "«/squiggle»" },
	{ name: "Interrobang", open: "⸘squiggle‽", close: "⸘/squiggle‽" },
	{ name: "Lenticular", open: "【squiggle】", close: "【/squiggle】" },
	{ name: "Tortoise", open: "〔squiggle〕", close: "〔/squiggle〕" },
	{ name: "Black lenticular", open: "〖squiggle〗", close: "〖/squiggle〗" },
	{ name: "White corner", open: "『squiggle』", close: "『/squiggle』" },
	{ name: "CJK double angle", open: "《squiggle》", close: "《/squiggle》" },
	{ name: "Heavy angle", open: "❮squiggle❯", close: "❮/squiggle❯" },
	{ name: "Math angle", open: "⟨squiggle⟩", close: "⟨/squiggle⟩" },
	{ name: "Double math", open: "⟪squiggle⟫", close: "⟪/squiggle⟫" },
	{ name: "Floor/ceil", open: "⌊squiggle⌉", close: "⌊/squiggle⌉" },
	{ name: "Dragon", open: "🐉squiggle🐉", close: "🐉/squiggle🐉" },
	{ name: "Dragon alt", open: "🐲squiggle🐲", close: "🐲/squiggle🐲" },
	{ name: "Crystal ball", open: "🔮squiggle🔮", close: "🔮/squiggle🔮" },
	{ name: "Nazar", open: "🧿squiggle🧿", close: "🧿/squiggle🧿" },
	{ name: "Tree", open: "🌲squiggle🌲", close: "🌲/squiggle🌲" },
	{ name: "Herb", open: "🌿squiggle🌿", close: "🌿/squiggle🌿" },
	{ name: "Leaf", open: "🍃squiggle🍃", close: "🍃/squiggle🍃" },
	{ name: "Sparkles", open: "✨squiggle✨", close: "✨/squiggle✨" },
	{ name: "Scroll", open: "📜squiggle📜", close: "📜/squiggle📜" },
	{ name: "Tilde", open: "〰squiggle〰", close: "〰/squiggle〰" },
] as const;

function randomFlavor(): (typeof SQUIGGLE_FLAVORS)[number] {
	return SQUIGGLE_FLAVORS[Math.floor(Math.random() * SQUIGGLE_FLAVORS.length)];
}

function sha3Truncated(content: string): string {
	const hash = createHash("sha3-256").update(content).digest("hex");
	return hash.slice(0, 12);
}

// ============================================================================
// Squiggle State (tracked per-session)
// ============================================================================

/**
 * Nesting policy for squiggle blocks.
 * - strict: error on double-close or nested open (default)
 * - lenient: auto-recover from mismatches silently
 * - stack: allow proper nesting, closes pop most recent open
 */
export type SquiggleNestingPolicy = "strict" | "lenient" | "stack";

/**
 * Individual squiggle frame — one open waiting for close.
 */
export interface SquiggleFrame {
	/** Unique id for this squiggle instance */
	id: string;
	/** When this squiggle was opened */
	openTimestamp: Timestamp;
	/** The flavor used */
	flavor: (typeof SQUIGGLE_FLAVORS)[number];
	/** Content accumulated since open (for hashing) */
	contentBuffer: string;
	/** Optional topic/intent */
	topic?: string;
}

export interface SquiggleState {
	/** Stack of open squiggles (bottom = oldest, top = most recent) */
	stack: SquiggleFrame[];
	/** Current turn index */
	turn: number;
	/** Last squiggle close timestamp (for delta calculation) */
	lastCloseTimestamp?: Timestamp;
	/** Counter for unique squiggle IDs */
	idCounter: number;
	/** Nesting policy */
	policy: SquiggleNestingPolicy;
}

export function initSquiggleState(policy: SquiggleNestingPolicy = "strict"): SquiggleState {
	return {
		stack: [],
		turn: 0,
		lastCloseTimestamp: undefined,
		idCounter: 0,
		policy,
	};
}

/** Check if any squiggle is currently open */
export function isSquiggleOpen(state: SquiggleState): boolean {
	return state.stack.length > 0;
}

/** Get the current (topmost) open squiggle, if any */
export function currentSquiggle(state: SquiggleState): SquiggleFrame | undefined {
	return state.stack.length > 0 ? state.stack[state.stack.length - 1] : undefined;
}

/** Get nesting depth */
export function squiggleDepth(state: SquiggleState): number {
	return state.stack.length;
}

// ============================================================================
// Content Tracking
// ============================================================================

/**
 * Append content to the squiggle buffer (called by harness as model generates).
 * Accumulates to topmost open squiggle. If stack policy, all open frames get content.
 */
export function appendSquiggleContent(state: SquiggleState, content: string): void {
	if (state.stack.length === 0) return;
	
	if (state.policy === "stack") {
		// In stack mode, content goes to all open frames (nested reasoning)
		for (const frame of state.stack) {
			frame.contentBuffer += content;
		}
	} else {
		// In strict/lenient mode, content goes only to topmost
		state.stack[state.stack.length - 1].contentBuffer += content;
	}
}

/**
 * Notify state of turn change.
 */
export function setSquiggleTurn(state: SquiggleState, turn: number): void {
	state.turn = turn;
}

// ============================================================================
// Tool Implementations
// ============================================================================

function formatDelta(fromTs: Timestamp | undefined, toTs: Timestamp): string {
	if (!fromTs) return "";
	const from = new Date(fromTs);
	const to = new Date(toTs);
	const diffMs = to.getTime() - from.getTime();
	const diffSec = Math.floor(diffMs / 1000);

	if (diffSec < 60) return `${diffSec}s`;
	if (diffSec < 300) {
		const m = Math.floor(diffSec / 60);
		const s = diffSec % 60;
		return `${m}m${s}s`;
	}
	if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
	const h = Math.floor(diffSec / 3600);
	const m = Math.floor((diffSec % 3600) / 60);
	return m > 0 ? `${h}h${m}m` : `${h}h`;
}

function formatTimestamp(ts: Timestamp): string {
	// Extract just the time portion for closing tag (short form)
	const match = ts.match(/T(\d{2}:\d{2}:\d{2})/);
	return match ? match[1] : ts;
}

/**
 * Error types for squiggle operations.
 */
export type SquiggleError =
	| { tag: "AlreadyOpen"; depth: number; topId: string }
	| { tag: "NotOpen" }
	| { tag: "NestingViolation"; expected: string; got: string };

export type SquiggleOpenOutcome =
	| { ok: true; result: SquiggleOpenResult }
	| { ok: false; error: SquiggleError; fallback: SquiggleOpenResult };

export function executeSquiggleOpen(
	state: SquiggleState,
	args: { flavor?: string; topic?: string },
): SquiggleOpenOutcome {
	const ts = now();
	const flavor = args.flavor
		? SQUIGGLE_FLAVORS.find((f) => f.name.toLowerCase() === args.flavor?.toLowerCase()) ?? randomFlavor()
		: randomFlavor();

	// Check for already-open squiggle
	if (state.stack.length > 0) {
		const top = state.stack[state.stack.length - 1];
		
		if (state.policy === "strict") {
			// Error: can't open while another is open
			const errorDelimiter = `❮squiggle ERROR: already open (${top.id}, depth=${state.stack.length})❯`;
			return {
				ok: false,
				error: { tag: "AlreadyOpen", depth: state.stack.length, topId: top.id },
				fallback: {
					delimiter: errorDelimiter,
					flavor: flavor.name,
					timestamp: ts,
					turn: state.turn,
					delta: undefined,
				},
			};
		} else if (state.policy === "lenient") {
			// Auto-close the existing one, then open new
			// (close is silent, just pop the stack)
			state.stack.pop();
		}
		// stack policy: allow nesting, just push
	}

	// Create new frame
	const id = `sq_${state.idCounter++}`;
	const frame: SquiggleFrame = {
		id,
		openTimestamp: ts,
		flavor,
		contentBuffer: "",
		topic: args.topic,
	};
	state.stack.push(frame);

	const delta = formatDelta(state.lastCloseTimestamp, ts);
	const deltaStr = delta ? ` Δ${delta}` : "";

	const tzOffset = ts.endsWith("-04:00") ? "EDT/-04:00" : "EST/-05:00";
	const delimiter = `${flavor.open.replace("squiggle", `squiggle T=${ts} [NYC=${tzOffset}] turn:${state.turn}${deltaStr}`)}`;

	return {
		ok: true,
		result: {
			delimiter,
			flavor: flavor.name,
			timestamp: ts,
			turn: state.turn,
			delta: delta || undefined,
		},
	};
}

export type SquiggleCloseOutcome =
	| { ok: true; result: SquiggleCloseResult; closedId: string }
	| { ok: false; error: SquiggleError; fallback: SquiggleCloseResult };

export function executeSquiggleClose(state: SquiggleState): SquiggleCloseOutcome {
	const closeTs = now();

	// Check for no open squiggle
	if (state.stack.length === 0) {
		if (state.policy === "strict") {
			return {
				ok: false,
				error: { tag: "NotOpen" },
				fallback: {
					delimiter: "❮/squiggle ERROR: no open squiggle❯",
					hash: "000000000000",
					durationMs: 0,
					contentLength: 0,
					timestamp: closeTs,
				},
			};
		} else {
			// lenient: return a no-op close
			return {
				ok: false,
				error: { tag: "NotOpen" },
				fallback: {
					delimiter: "❮/squiggle (no-op)❯",
					hash: "000000000000",
					durationMs: 0,
					contentLength: 0,
					timestamp: closeTs,
				},
			};
		}
	}

	// Pop the topmost frame
	const frame = state.stack.pop()!;

	const openTime = new Date(frame.openTimestamp).getTime();
	const closeTime = new Date(closeTs).getTime();
	const durationMs = closeTime - openTime;
	const durationStr = formatDelta(frame.openTimestamp, closeTs);

	const hash = sha3Truncated(frame.contentBuffer);
	const contentLength = frame.contentBuffer.length;

	// Format: ❮/squiggle T=10:42:45 H=a1b2c3d4e5f6 Δc=30s❯
	const closeBase = frame.flavor.close;
	const timeShort = formatTimestamp(closeTs);
	const delimiter = closeBase.replace(
		"/squiggle",
		`/squiggle T=${timeShort} H=${hash} Δc=${durationStr || "0s"}`,
	);

	// Update state
	state.lastCloseTimestamp = closeTs;

	return {
		ok: true,
		result: {
			delimiter,
			hash,
			durationMs,
			contentLength,
			timestamp: closeTs,
		},
		closedId: frame.id,
	};
}

// ============================================================================
// Tool Definitions (for registration with agent)
// ============================================================================

export function createSquiggleTools(state: SquiggleState): AgentTool[] {
	const squiggleOpen: AgentTool = {
		name: "squiggle_open",
		label: "Open Squiggle",
		description:
			"Open a visible reasoning block. Call at start of reasoning. Returns opening delimiter with timestamp and turn metadata.",
		parameters: Type.Object({
			flavor: Type.Optional(Type.String({ description: "Specific flavor name, or random if omitted" })),
			topic: Type.Optional(Type.String({ description: "What this reasoning block is about" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate) {
			const outcome = executeSquiggleOpen(state, params as { flavor?: string; topic?: string });
			const result = outcome.ok ? outcome.result : outcome.fallback;
			return {
				content: [{ type: "text" as const, text: result.delimiter }],
				details: {
					...result,
					ok: outcome.ok,
					error: outcome.ok ? undefined : outcome.error,
					depth: state.stack.length,
				},
			};
		},
	};

	const squiggleClose: AgentTool = {
		name: "squiggle_close",
		label: "Close Squiggle",
		description:
			"Close a visible reasoning block. Call at end of reasoning. Returns closing delimiter with hash and duration.",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate) {
			const outcome = executeSquiggleClose(state);
			const result = outcome.ok ? outcome.result : outcome.fallback;
			return {
				content: [{ type: "text" as const, text: result.delimiter }],
				details: {
					...result,
					ok: outcome.ok,
					error: outcome.ok ? undefined : outcome.error,
					closedId: outcome.ok ? outcome.closedId : undefined,
					remainingDepth: state.stack.length,
				},
			};
		},
	};

	return [squiggleOpen, squiggleClose];
}
