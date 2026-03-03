# Transcript Slicing Spec

**Author:** Carter Schonwald  
**Date:** 2026-03-02  
**Status:** Draft

## Overview

Agents need to reference, cite, and extract content from conversation history efficiently. Turn sigil+nonce pairs provide stable identity for addressing. This spec defines a coordinate system for transcript slicing.

## Coordinate Namespace

All coordinates use the `§` prefix (shared with handles):

| Prefix | Type | Example |
|--------|------|---------|
| `§h` | Handle (tool result) | `§h7` |
| `§r` | Turn reference | `§r_🐉frost-ember-peak` |
| `§l` | Absolute line | `§l_42` |

## Turn References

A turn reference uses sigil+nonce as identity:

```
§r_🐉frost-ember-peak
§r_✨glacier-pine-echo
§r_🌿copper-drift-vale
```

The `§r_` prefix distinguishes structural coordinates from content that might contain similar patterns.

## Offset Addressing

From a turn anchor, address content with direction and unit:

**Direction:**
- `↓` — down from turn start (forward)
- `↑` — up from turn end (backward)

**Units:**
- `¶` — paragraph
- `s` — sentence
- `l` — line
- (bare number) — turns

**Examples:**
```
§r_🐉frost-ember-peak ↓3¶      // 3rd paragraph from start
§r_🐉frost-ember-peak ↑2s      // 2nd-to-last sentence
§r_🐉frost-ember-peak ↓1l      // first line
```

**Special offsets:**
```
§r_🐉frost-ember-peak ↓first   // first element
§r_🐉frost-ember-peak ↑last    // last element
§r_🐉frost-ember-peak ↓all     // entire turn content
```

## Ranges

Specify start and end with `...`:

```
§r_🐉frost-ember-peak ↓2¶ ... ↓5¶
§r_🧿kelp-lava-steel ↓last ... §r_🐉frost-ember-peak ↓2¶
```

Cross-turn ranges are valid — they select all content between the two anchors.

## Role Exclusion

Exclude message roles from a slice with `-role`:

```
§r_🐉frost-ember-peak ↓all -toolResult     // skip tool outputs
§r_🐉frost-ember-peak ↓3¶ ... ↓7¶ -user    // no user messages in range
```

Available roles:
- `user`
- `assistant`
- `toolResult`
- `turnStart`
- `turnEnd`

Multiple exclusions:
```
§r_🐉frost-ember-peak ↓all -toolResult -turnStart -turnEnd
```

## Use Cases

### Citation Without Duplication

Instead of re-quoting content:
```
Analysis complete. Key findings at §r_🐉frost-ember-peak ↓3¶.
```

### Cross-Turn References

```
This contradicts §r_🧿kelp-lava-steel ↓2¶.s3 — resolution needed.
```

### Highlight/Selection Ranges

```
HIGHLIGHT: §r_🧙sage-dust-leaves ↓2¶ ... §r_🐉frost-ember-peak ↓4¶
```

### Context Injection

Harness can materialize a slice for re-injection:
```
inject(§r_🐉frost-ember-peak ↓all -toolResult)
```

### Role-Filtered Views

```
// All my reasoning blocks
assistant:§r_* ↓all:squiggle

// All user requests
user:§r_*
```

## Grammar

```
coordinate := §r_sigil-nonce [offset] [range] [exclusion*]
offset := (↓|↑)(number|first|last|all)(unit)?
unit := ¶ | s | l
range := ... coordinate
exclusion := -role
role := user | assistant | toolResult | turnStart | turnEnd
```

## Resolution

When resolving a coordinate:

1. Find turn by sigil+nonce match
2. Apply direction (↓ from TurnStartMessage, ↑ from TurnEndMessage)
3. Count units to reach offset
4. If range, collect all content between start and end
5. Filter by role exclusions

## Collision Avoidance

The `§r_` prefix prevents collision with content. Like 555 phone numbers, this namespace is reserved for structural coordinates.

If content literally contains `§r_🐉frost-ember-peak`, the parser distinguishes:
- Bare in text: literal content
- In coordinate position (after citation marker, in slice syntax): structural reference

## Future Extensions

- `§c_` — chunk references (compaction units)
- `§s_` — squiggle block references  
- `§t_` — tool call references
- Regex/search within slices: `§r_🐉frost-ember-peak ↓all:grep("pattern")`

## Integration

This coordinate system integrates with:
- **Turn boundaries**: sigil+nonce from TurnStartMessage/TurnEndMessage
- **Handle tools**: `§h` namespace already established
- **Entity reasoning**: discourse coordinates for coreference
- **Compaction**: stable references survive summarization
