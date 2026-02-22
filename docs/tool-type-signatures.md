# Tool Type Signatures

Lean/Agda style dependent type signatures for pi tool specifications.

## Notation

```
Type?         -- optional (Maybe/Option)
Type!         -- required
{ p : Prop }  -- precondition/refinement
→             -- function arrow
IO            -- effectful computation
Result A E    -- Either E A / success or error
∈             -- element of / substring of
¬             -- negation
∨             -- disjunction
∧             -- conjunction
```

## Core Tools

### read

```lean
read : (path : FilePath!)
     → (offset : ℕ?)              -- line number to start (1-indexed)
     → (limit : ℕ?)               -- max lines to read
     → { _ : path.exists }        -- precondition: file exists
     → IO (Result FileContent ReadError)

FileContent := 
  | Text { content : String, lines : ℕ, truncated : Bool }
  | Image { format : ImageFormat, width : ℕ, height : ℕ }
  
ReadError :=
  | NotFound
  | PermissionDenied
  | Binary { detected : MimeType }
  | TooLarge { size : ℕ, limit : ℕ }
```

### bash

```lean
bash : (command : String!)
     → (timeout : ℕ?)             -- seconds, default 120
     → { _ : approved(command) ∨ pure(command) }  -- permission gate
     → IO (Result BashOutput BashError)

BashOutput := {
  stdout : String,
  stderr : String,
  exitCode : ℤ,
  duration : Duration
}

BashError :=
  | Timeout { partial : BashOutput }
  | Killed { signal : Signal }
  | NotApproved { command : String }

-- Purity classification
pure : String → Bool
pure cmd = cmd.matches(readOnlyPatterns)
  where readOnlyPatterns = 
    [ /^(cat|head|tail|grep|rg|find|fd|ls|stat|file|which|echo|pwd|whoami)/
    , /^(sha256sum|md5sum|xxd|hexdump|wc|sort|uniq|diff|comm)/
    , /^git\s+(log|show|diff|status|branch|ls-files|blame)/
    ]
```

### edit

```lean
edit : (path : FilePath!)
     → (oldText : String!)
     → (newText : String!)
     → { _ : path.exists ∧ oldText ∈ contents(path) }  -- must match exactly
     → { _ : (oldText ∈ contents(path)).count = 1 }    -- unique match
     → IO (Result Unit EditError)

EditError :=
  | NotFound
  | NoMatch { searched : String }
  | MultipleMatches { count : ℕ }
  | PermissionDenied
```

### write

```lean
write : (path : FilePath!)
      → (content : String!)
      → { _ : ¬path.exists ∨ approved("overwrite", path) }
      → IO (Result Unit WriteError)

WriteError :=
  | PermissionDenied
  | DirectoryCreationFailed { path : FilePath }
  | DiskFull
```

### grep

```lean
grep : (pattern : Regex!)
     → (path : GlobPattern?)      -- default: current directory
     → (contextLines : ℕ?)        -- lines of context around match
     → { _ : pattern.validRegex }
     → IO (Result (List GrepMatch) GrepError)

GrepMatch := {
  path : FilePath,
  line : ℕ,
  column : ℕ,
  content : String,
  context : { before : List String, after : List String }
}

GrepError :=
  | InvalidPattern { pattern : String, reason : String }
  | TooManyMatches { count : ℕ, limit : ℕ }
```

### find

```lean
find : (pattern : GlobPattern!)
     → (path : FilePath?)         -- default: current directory
     → (type : FileType?)         -- file, directory, or both
     → IO (Result (List FilePath) FindError)

FileType := File | Directory | Both

FindError :=
  | InvalidGlob { pattern : String }
  | TooManyResults { count : ℕ, limit : ℕ }
```

### ls

```lean
ls : (path : FilePath?)           -- default: current directory
   → (all : Bool?)                -- include hidden files
   → (long : Bool?)               -- detailed listing
   → { _ : path.isDirectory }
   → IO (Result (List DirEntry) LsError)

DirEntry := {
  name : String,
  type : FileType,
  size : ℕ,
  modified : Timestamp,
  permissions : Permissions
}

LsError :=
  | NotFound
  | NotDirectory
  | PermissionDenied
```

## DCP Handle Tools

When tool results exceed materialization budget, handles are returned instead.

### Handle Type

```lean
Handle := {
  id : HandleId,                  -- e.g., §h7
  sourceTool : String,
  totalTokens : ℕ,
  totalLines : ℕ,
  preview : String,               -- first ~100 chars
  status : HandleStatus
}

HandleStatus := Pending | Resolved | Consumed | Evicted

HandleId := String & { _ : matches(/^§h\d+$/) }
```

### handle_lines

```lean
handle_lines : (handle : HandleId!)
             → (start : ℕ!)           -- 1-indexed
             → (end : ℕ!)             -- inclusive
             → { _ : handle.valid }
             → { _ : start ≤ end }
             → IO (Result String HandleError)
```

### handle_grep

```lean
handle_grep : (handle : HandleId!)
            → (pattern : String!)     -- regex or literal
            → { _ : handle.valid }
            → IO (Result (List String) HandleError)
```

### handle_head

```lean
handle_head : (handle : HandleId!)
            → (n : ℕ!)
            → { _ : handle.valid }
            → IO (Result String HandleError)
```

### handle_tail

```lean
handle_tail : (handle : HandleId!)
            → (n : ℕ!)
            → { _ : handle.valid }
            → IO (Result String HandleError)
```

### handle_count

```lean
handle_count : (handle : HandleId!)
             → { _ : handle.valid }
             → IO (Result ℕ HandleError)
```

### cot_replay

```lean
cot_replay : (turn : ℕ!)
           → { _ : turn < currentTurn }
           → { _ : cotStored(turn) }
           → IO (Result String CotError)

CotError :=
  | TurnNotFound
  | NoCotStored
```

## Common Types

```lean
FilePath := String & { _ : validPath }
GlobPattern := String & { _ : validGlob }
Regex := String & { _ : validRegex }
Timestamp := ℕ  -- epoch milliseconds
Duration := ℕ   -- milliseconds
Signal := SIGTERM | SIGKILL | SIGINT | ...
MimeType := String
ImageFormat := PNG | JPEG | GIF | WEBP

Permissions := {
  owner : RWX,
  group : RWX,
  other : RWX
}

RWX := { read : Bool, write : Bool, execute : Bool }
```

## Idempotency Classification

```lean
data Idempotency := Pure | Session | NonIdempotent

-- Pure: safe to cache indefinitely, dedup identical calls
-- Session: stable within session, invalidate on context change
-- NonIdempotent: side effects, must execute every time

classifyTool : ToolName → Idempotency
classifyTool "read" = Pure
classifyTool "grep" = Pure
classifyTool "find" = Pure
classifyTool "ls" = Pure
classifyTool "bash" = classifyBash(command)
classifyTool "edit" = NonIdempotent
classifyTool "write" = NonIdempotent
classifyTool _ = NonIdempotent

classifyBash : String → Idempotency
classifyBash cmd | pure(cmd) = Pure
classifyBash cmd | sessionStable(cmd) = Session
classifyBash _ = NonIdempotent
```

## Intent (Future)

When the Intent system is implemented:

```lean
data Intent := Exists | Structure | Sample | Verify | Full

read' : (path : FilePath!)
      → (intent : Intent!)        -- why are you reading?
      → (offset : ℕ?)
      → (limit : ℕ?)
      → IO (Result (IntentResult intent) ReadError)

IntentResult : Intent → Type
IntentResult Exists = { exists : Bool, type : FileType, size : ℕ }
IntentResult Structure = { outline : List Heading, format : FileFormat }
IntentResult Sample = { head : String, tail : String, elided : ℕ }
IntentResult Verify = { hash : ContentHash, size : ℕ, mtime : Timestamp }
IntentResult Full = FileContent
```

---

*These signatures are aspirational — the preconditions document invariants the harness should enforce, even if current implementation doesn't fully verify them.*
