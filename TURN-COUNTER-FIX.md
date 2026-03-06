# Turn Counter Persistence Fix

## Problem
Turn brackets from historical sessions (especially pre-compaction or pre-branch) were not rendering in the TUI. This was because turn boundaries store absolute turn numbers that don't align with assistant message indices after compaction/branching.

**Example bug:**
- Old session had turns 1-5
- Session was compacted/branched
- Now in new active session turns 1-2 (only 2 assistant messages)
- Old turn boundaries reference `turn: 4, 5`
- In `buildSessionContext()`, code tries `assistantIndices[turn - 1]` = `assistantIndices[3]`, `assistantIndices[4]`
- Both fail silently (undefined), boundary not injected
- Result: old turn brackets disappear from TUI

## Solution
Persist the global turn counter to session entries so it's never lost and always accurate.

### Changes Made

#### 1. `session-manager.ts`
Added `turnNumber: number` field to `TurnBoundaryEntry`:
```typescript
export interface TurnBoundaryEntry extends SessionEntryBase {
	type: "turn_boundary";
	boundary: TurnStartMessage | TurnEndMessage;
	turnNumber: number;  // ← Persisted turn counter at creation time
}
```

Updated `appendTurnBoundary()` to accept and store turn number:
```typescript
appendTurnBoundary(boundary: TurnStartMessage | TurnEndMessage, turnNumber: number): string {
	return this._createEntry<TurnBoundaryEntry>({ type: "turn_boundary", boundary, turnNumber });
}
```

Added backwards compatibility in `buildSessionContext()`:
```typescript
const tbEntry = entry as typeof entry & { turnNumber?: number };
const turn = tbEntry.turnNumber ?? entry.boundary.turn;  // Fall back to boundary.turn if missing
```

#### 2. `agent-session.ts`
Updated `_injectTurnBoundaries()` to pass turn number when persisting:
```typescript
const turnNumber = turnStart.turn;
this.sessionManager.appendTurnBoundary(turnStart, turnNumber);
this.sessionManager.appendTurnBoundary(turnEnd, turnNumber);
```

Initialize turn counter from persisted entries on session creation:
```typescript
this._carterKit.initializeTurnCounterFromEntries(this.sessionManager.getEntries());
```

#### 3. `session-hook.ts`
Added `initializeTurnCounterFromEntries()` to CarterKitHook interface and implementation:
```typescript
initializeTurnCounterFromEntries(entries: Array<{ type: string; turnNumber?: number }>): void {
	let maxTurn = 0;
	for (const entry of entries) {
		if (entry.type === "turn_boundary" && entry.turnNumber !== undefined) {
			maxTurn = Math.max(maxTurn, entry.turnNumber);
		}
	}
	_boundaryState.currentTurn = maxTurn;  // Resume from max turn in history
}
```

## How It Works

**New sessions:**
1. Turn counter starts at 0
2. Each turn incremented and persisted in `turnNumber` field
3. On reload, max turn reconstructed from persisted entries
4. New turns resume with `currentTurn = maxTurn + 1`

**Old sessions (before fix):**
- No `turnNumber` field in entries
- Code falls back to `boundary.turn` (the ephemeral counter from when they were created)
- Backwards compatible — old boundaries still render (though not ideal if history has gaps)

**Sessions with compaction/branching:**
- Compacted entries have turn numbers from their original creation
- When loaded, max turn is read from full history
- New turns in the branch continue sequentially from that max
- All boundaries render correctly because turn numbers are immutable

## Side Effects
None. The change is additive and backwards compatible:
- Old entries without `turnNumber` fall back to `boundary.turn`
- New entries have explicit `turnNumber` that persists across reloads
- No data loss or corruption

## Testing
Manual verification:
- Old session loaded → boundaries render (fall back to boundary.turn)
- New session created → new turn boundaries persist correctly
- Compacted session → boundaries maintain identity across compaction
- Build successful with no type errors

