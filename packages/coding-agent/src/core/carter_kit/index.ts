/**
 * Carter Kit — Context management, handles, CoT persistence
 *
 * Re-exports for the public API.
 */

// Interceptor
export type { CaptureResult, HandleOp, InterceptDecision } from "./interceptor.js";
export { captureCoT, captureResult, decideIntercept, execHandleOp } from "./interceptor.js";
// Runtime
export type { CarterKitRuntime, PushDownToolDef, ToolCallIntercept } from "./runtime.js";
export {
	COT_REPLAY_TOOL,
	enrichCompactionInput,
	HANDLE_TOOLS_PROMPT,
	initRuntime,
	interceptToolCall,
	interceptToolResult,
	onTurnEnd,
	PUSHDOWN_TOOLS,
	pressureWarning,
	shutdownRuntime,
} from "./runtime.js";
// Session hook
export type { CarterKitHook } from "./session-hook.js";
export { createCarterKitHook } from "./session-hook.js";
// Store
export type { Store } from "./store.js";
export {
	closeStore,
	getBlob,
	getBlobContent,
	getChunk,
	getHandle,
	hash,
	openStore,
	putBlob,
	putChunk,
	putHandle,
} from "./store.js";
// Squiggle tools — visible reasoning demarcation
export type {
	SquiggleState,
	SquiggleFrame,
	SquiggleNestingPolicy,
	SquiggleError,
	SquiggleOpenOutcome,
	SquiggleCloseOutcome,
} from "./squiggle-tools.js";
export {
	initSquiggleState,
	isSquiggleOpen,
	currentSquiggle,
	squiggleDepth,
	appendSquiggleContent,
	setSquiggleTurn,
	executeSquiggleOpen,
	executeSquiggleClose,
	createSquiggleTools,
} from "./squiggle-tools.js";
// Turn boundaries — TurnStartMessage / TurnEndMessage injection
export type { TurnBoundaryState } from "./turn-boundary.js";
export {
	initTurnBoundaryState,
	onTurnStart,
	onTurnEnd as onTurnBoundaryEnd,
	injectTurnBoundaries,
	renderTurnStart,
	renderTurnEnd,
} from "./turn-boundary.js";
// Types — the algebra
export type {
	Blob,
	BlobType,
	Chunk,
	ChunkDep,
	ChunkLevel,
	CompactionEvent,
	ContentHash,
	DepType,
	Handle,
	HandleId,
	HandleStatus,
	Idempotency,
	OracleOp,
	PageTable,
	PressureLevel,
	Residency,
} from "./types.js";
export {
	Consumed,
	classifyBash,
	classifyTool,
	Evicted,
	emptyPageTable,
	freshHandleId,
	HandleOnly,
	HEvicted,
	handleCacheKey,
	materializationBudget,
	mkContentHash,
	Pending,
	pressureLevel,
	ptAddDep,
	ptDependencies,
	ptDependents,
	ptHandlesByStatus,
	ptInsertChunk,
	ptInsertHandle,
	ptIsRoot,
	ptLookupHandle,
	ptSetPressure,
	ptTouchChunk,
	Raw,
	Resolved,
	resetHandleCounter,
	Skeletal,
} from "./types.js";
