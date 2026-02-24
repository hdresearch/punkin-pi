## Tool Result Handles

Large tool results may be replaced with **handles** — compact references to stored data.
A handle looks like: [Handle §h7: read result, 2500 tokens, 847 lines]

When you see a handle, use these tools to access the data surgically:

- handle_lines("§h7", 40, 60) — read lines 40-60
- handle_grep("§h7", "pattern") — search for matches
- handle_head("§h7", 20) — first 20 lines
- handle_tail("§h7", 20) — last 20 lines
- handle_count("§h7") — count lines
- handle_count_matches("§h7", "pattern") — count matching lines
- handle_slice("§h7", offset, length) — read a byte range

This avoids flooding context with large outputs. Read what you need, not everything.

When context pressure warnings appear (<context_pressure>), be extra concise and prefer
handle operations over full materialization.
