# 01: Store + Persistence

## Purpose

Content-addressed storage for DCP: verbatim turns, CoT, skeletal
forms, metadata, page table, handle registry, knowledge graph.
The lossless backing store that makes compaction fully invertible.

## Dependencies

None. Leaf node.

## Architecture: DuckDB + Blob Files

**DuckDB** for all structured data (metadata, page table, handles,
graph edges, indices). **Blob files** for bulk content (verbatim
turns, CoT, large tool results).

Why DuckDB:
- Embeddable, single file, no server
- Both Haskell and Swift open the same `.duckdb` file via C API
- SQL for ad-hoc queries (operator can just `SELECT` the page table)
- BLOB columns for small content, file refs for large content
- Columnar + analytical — fast aggregation for eviction scoring,
  pressure calculation, graph queries
- Struct/list/map column types — no ORM gymnastics for nested data
- Parquet export for archival/sharing

Why not custom store first:
- Custom K12 content-addressed blob store is correct but slow to build
- DuckDB gets us running in hours, not days
- Swap to custom store later if DuckDB becomes a bottleneck (it won't
  for a long time — DCP data volumes are small)

## Content Hash

```
ContentHash = K12(content, 32)  -- KangarooTwelve, 32 bytes
Display:     hex(hash[:8])      -- "a7f3e2b1"
```

KangarooTwelve: Keccak family, XOF, tree hashing, 6-7 GB/s.
FFI to XKCP reference C implementation. Not crypton.

## Schema

```sql
-- Bulk content (blobs on disk, metadata in DB)
CREATE TABLE blobs (
  hash         BLOB PRIMARY KEY,   -- K12 content hash, 32 bytes
  type         TEXT NOT NULL,       -- 'raw_turns', 'cot', 'skeletal',
                                   -- 'tool_result', 'graph_delta'
  size_bytes   INTEGER NOT NULL,
  created_at   TIMESTAMP DEFAULT now(),
  session_id   TEXT,
  ref_count    INTEGER DEFAULT 1,
  -- small content inline, large content on disk
  inline_data  BLOB,               -- if size < 64KB, store here
  file_path    TEXT                 -- else, path to blob file
);

-- Page table
CREATE TABLE chunks (
  id           BLOB PRIMARY KEY,   -- content hash of chunk
  level        TEXT NOT NULL,       -- 'raw', 'skeletal', 'referential', 'evicted'
  turn_start   INTEGER,
  turn_end     INTEGER,
  tags         TEXT[],              -- semantic tags
  tokens_raw   INTEGER,
  tokens_now   INTEGER,
  pinned       BOOLEAN DEFAULT false,
  pin_reason   TEXT,
  oracle_edits INTEGER DEFAULT 0,
  snapshot_id  TEXT,                -- for rollback, optional
  created_at   TIMESTAMP DEFAULT now(),
  accessed_at  TIMESTAMP DEFAULT now(),
  -- refs to blob content
  raw_hash     BLOB REFERENCES blobs(hash),
  skeletal_hash BLOB REFERENCES blobs(hash),
  cot_hash     BLOB REFERENCES blobs(hash)
);

-- Dependencies between chunks
CREATE TABLE chunk_deps (
  from_chunk   BLOB REFERENCES chunks(id),
  to_chunk     BLOB REFERENCES chunks(id),
  dep_type     TEXT NOT NULL,       -- 'depends_on', 'feeds', 'coreference'
  PRIMARY KEY (from_chunk, to_chunk, dep_type)
);

-- Handle registry
CREATE TABLE handles (
  id           TEXT PRIMARY KEY,    -- '§h7', '§mw_read', etc.
  source_tool  TEXT NOT NULL,       -- 'read', 'bash', etc.
  source_args  TEXT,                -- JSON of tool call args
  status       TEXT NOT NULL,       -- 'pending', 'resolved', 'consumed', 'evicted'
  idempotency  TEXT NOT NULL,       -- 'pure', 'session', 'non_idempotent'
  result_hash  BLOB REFERENCES blobs(hash),
  total_tokens INTEGER,
  materialized_tokens INTEGER DEFAULT 0,
  chunk_id     BLOB REFERENCES chunks(id),
  turn_index   INTEGER,
  created_at   TIMESTAMP DEFAULT now(),
  resolved_at  TIMESTAMP,
  consumed_at  TIMESTAMP
);

-- Knowledge graph nodes
CREATE TABLE kg_nodes (
  id           BLOB PRIMARY KEY,   -- content hash
  node_type    TEXT NOT NULL,       -- 'decision', 'finding', 'entity',
                                   -- 'state_change', 'constraint'
  content      TEXT NOT NULL,
  attributes   TEXT,                -- JSON map
  session_id   TEXT,
  created_at   TIMESTAMP DEFAULT now()
);

-- Knowledge graph edges
CREATE TABLE kg_edges (
  from_node    BLOB REFERENCES kg_nodes(id),
  to_node      BLOB REFERENCES kg_nodes(id),
  relation     TEXT NOT NULL,       -- 'reason', 'rejects', 'changes',
                                   -- 'depends_on', 'attributed_to',
                                   -- 'must_link', 'cannot_link'
  provenance   TEXT,                -- which chunk/turn sourced this
  created_at   TIMESTAMP DEFAULT now(),
  PRIMARY KEY (from_node, to_node, relation)
);

-- Oracle operations log (append-only)
CREATE TABLE oracle_log (
  id           INTEGER PRIMARY KEY,
  op           TEXT NOT NULL,       -- 'pin', 'edit', 'inject', 'promote',
                                   -- 'demote', 'tag', 'retag'
  target_chunk BLOB,
  target_node  BLOB,
  payload      TEXT,                -- JSON of the operation details
  created_at   TIMESTAMP DEFAULT now()
);

-- Compaction events log
CREATE TABLE compaction_log (
  id           INTEGER PRIMARY KEY,
  chunks_in    BLOB[],             -- chunks that were compacted
  chunk_out    BLOB,               -- resulting skeletal chunk
  tokens_freed INTEGER,
  reroll_cost  INTEGER,            -- estimated reroll tokens
  clone_session TEXT,              -- shadow clone session ID
  pressure_before FLOAT,
  pressure_after  FLOAT,
  created_at   TIMESTAMP DEFAULT now()
);
```

## Blob Storage

```
$DCP_DATA/
  dcp.duckdb           -- all structured data
  blobs/
    a7/f3e2b1...       -- git-style sharded directories
    b2/c4d1f8...
```

Small blobs (<64KB) stored inline in DuckDB BLOB column.
Large blobs (CoT, full file reads) on disk, referenced by path.
Threshold is configurable. Most metadata, skeletal forms, and
graph deltas are small → inline. Verbatim turns and CoT are
large → disk.

## Interface

```haskell
module DCP.Store where

data Store  -- opaque, holds DuckDB connection + blob dir path

-- Lifecycle
openStore   :: FilePath -> IO Store
closeStore  :: Store -> IO ()

-- Blobs
putBlob     :: Store -> BlobType -> ByteString -> IO ContentHash
getBlob     :: Store -> ContentHash -> IO (Maybe ByteString)
hasBlob     :: Store -> ContentHash -> IO Bool

-- Page table
getChunk    :: Store -> ContentHash -> IO (Maybe Chunk)
putChunk    :: Store -> Chunk -> IO ()
listChunks  :: Store -> ChunkQuery -> IO [Chunk]
updateChunk :: Store -> ContentHash -> (Chunk -> Chunk) -> IO ()

-- Handles
getHandle   :: Store -> HandleId -> IO (Maybe Handle)
putHandle   :: Store -> Handle -> IO ()
listHandles :: Store -> HandleQuery -> IO [Handle]

-- Knowledge graph
addNode     :: Store -> KGNode -> IO ContentHash
addEdge     :: Store -> KGEdge -> IO ()
queryGraph  :: Store -> GraphQuery -> IO [KGNode]
neighbors   :: Store -> ContentHash -> IO [(KGEdge, KGNode)]

-- Oracle log
logOracleOp :: Store -> OracleOp -> IO ()

-- Compaction log
logCompaction :: Store -> CompactionEvent -> IO ()

-- Eviction scoring (uses DuckDB aggregation)
evictionScores :: Store -> IO [(ContentHash, Float)]
```

## DuckDB Access from Swift

The Swift panel opens the same `dcp.duckdb` file read-only:

```swift
import DuckDB

let db = try Database(store: .file(path: dcpDataPath + "/dcp.duckdb"),
                      access: .readOnly)
let conn = try db.connect()

// Query page table
let result = try conn.query("""
  SELECT id, level, tags, tokens_now, pinned
  FROM chunks ORDER BY turn_start
""")

// Render context map from results...
```

DuckDB supports concurrent readers. The Haskell harness writes,
the Swift panel reads. No custom IPC for data — just shared file.

For oracle operations (panel → harness), still use UDS + CBOR.
The panel sends commands, the harness writes to DuckDB. The panel
re-reads on next refresh.

## Implementation

Haskell:
- `DCP.Store` module — wraps DuckDB C API via FFI
- `DCP.Store.Hash` — K12 via XKCP FFI
- `DCP.Store.Schema` — table creation, migrations
- Dependencies: `duckdb-haskell` (or raw FFI to libduckdb),
  XKCP (FFI), `bytestring`

Swift:
- `DuckDB` Swift package (official, maintained by DuckDB team)
- XKCP linked as C library for hash verification
- Read-only access to same database file

## Tests

- put/get blob round-trip (inline and file-backed)
- content-addressing: same content → same hash → dedup
- page table CRUD
- handle lifecycle state transitions
- knowledge graph node/edge queries
- eviction score calculation
- concurrent read (Swift) while write (Haskell)
- DuckDB file corruption recovery (DuckDB handles this)
- K12 hash consistency between Haskell and Swift
