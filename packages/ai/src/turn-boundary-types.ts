/**
 * Turn Boundary Message Types
 *
 * First-class message types for turn demarcation.
 * Injected by harness AFTER turn completes — never during active generation.
 */

import type { Timestamp } from "./types.js";

/**
 * TurnStartMessage — injected before a completed assistant turn in history.
 *
 * Contains the bracket identity (sigil, nonce) and temporal metadata.
 * Only appears on past turns — current turn has no start message until done.
 */
export interface TurnStartMessage {
	role: "turnStart";
	/** Turn index (0-indexed or 1-indexed per convention) */
	turn: number;
	/** Unicode sigil for this turn's bracket */
	sigil: string;
	/** Three-word nonce for uniqueness */
	nonce: string;
	/** When the turn started (T= in bracket) */
	timestamp: Timestamp;
	/** Time since previous turn ended */
	delta?: string;
}

/**
 * TurnEndMessage — injected after a completed assistant turn in history.
 *
 * Contains the integrity hash and duration metadata.
 * Sigil+nonce must match the corresponding TurnStartMessage (invariant identity).
 * Only appears on past turns — current turn has no end message until done.
 */
export interface TurnEndMessage {
	role: "turnEnd";
	/** Turn index (matches corresponding TurnStartMessage) */
	turn: number;
	/** Unicode sigil — must match TurnStartMessage */
	sigil: string;
	/** Three-word nonce — must match TurnStartMessage */
	nonce: string;
	/** SHA3-256 truncated hash of turn content (H= in bracket) */
	hash: string;
	/** When the turn ended */
	timestamp: Timestamp;
	/** Total tokens in this turn */
	tokenCount?: number;
	/** Turn duration in milliseconds */
	durationMs?: number;
	/** True if message has no text/thinking content (only toolCalls or nothing). Clients can suppress rendering. */
	isEmpty?: boolean;
}

// ============================================================================
// Squiggle Tool Result Structures
// ============================================================================

/**
 * SquiggleOpenResult — returned by squiggle_open tool.
 *
 * Model calls squiggle_open at start of reasoning block.
 * Harness returns opening delimiter with temporal metadata.
 */
export interface SquiggleOpenResult {
	/** The opening delimiter string, e.g., "❮squiggle T=...❯" */
	delimiter: string;
	/** Which flavor was selected */
	flavor: string;
	/** Opening timestamp */
	timestamp: Timestamp;
	/** Current turn index */
	turn: number;
	/** Time since last squiggle or turn start */
	delta?: string;
}

/**
 * SquiggleCloseResult — returned by squiggle_close tool.
 *
 * Model calls squiggle_close at end of reasoning block.
 * Harness computes hash of content since squiggle_open, returns closing delimiter.
 */
export interface SquiggleCloseResult {
	/** The closing delimiter string, e.g., "❮/squiggle H=... Δc=...❯" */
	delimiter: string;
	/** SHA3-256 truncated hash of squiggle content */
	hash: string;
	/** Cognition duration (open → close) in milliseconds */
	durationMs: number;
	/** Character count of content between open and close */
	contentLength: number;
	/** Closing timestamp */
	timestamp: Timestamp;
}

// ============================================================================
// Extended Message Union
// ============================================================================

/**
 * BoundaryMessage — union of turn boundary message types.
 */
export type BoundaryMessage = TurnStartMessage | TurnEndMessage;

/**
 * isTurnStart — type guard for TurnStartMessage
 */
export function isTurnStart(msg: { role: string }): msg is TurnStartMessage {
	return msg.role === "turnStart";
}

/**
 * isTurnEnd — type guard for TurnEndMessage
 */
export function isTurnEnd(msg: { role: string }): msg is TurnEndMessage {
	return msg.role === "turnEnd";
}

/**
 * isBoundaryMessage — type guard for any boundary message
 */
export function isBoundaryMessage(msg: { role: string }): msg is BoundaryMessage {
	return msg.role === "turnStart" || msg.role === "turnEnd";
}
