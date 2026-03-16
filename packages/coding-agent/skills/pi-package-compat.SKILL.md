# Installing Pi Packages in Punkin

## Trigger
- "install pi package"
- "pi package in punkin"
- "pi-mcp-adapter"
- "mariozechner package"
- "@mariozechner"
- "package compatibility"
- "cannot find module @mariozechner"

## Problem

Pi packages from npm (e.g., `npm:pi-mcp-adapter`) are built for the original pi codebase and import from `@mariozechner/*` packages:
- `@mariozechner/pi-tui`
- `@mariozechner/pi-coding-agent`
- `@mariozechner/pi-ai`

Punkin forked these to `@punkin-pi/*`, so pi packages fail with:
```
Cannot find module '@mariozechner/pi-tui'
```

## Solution: Symlink Aliasing

After installing a pi package, create symlinks to map the old package names to punkin's packages.

### Step-by-Step

1. **Install the package:**
   ```bash
   punkin install npm:<package-name>
   ```

2. **Create aliases in the package's node_modules:**
   ```bash
   cd /opt/homebrew/lib/node_modules/<package-name>
   mkdir -p node_modules/@mariozechner
   ln -sf /Users/noah/code/punkin-pi/packages/tui node_modules/@mariozechner/pi-tui
   ln -sf /Users/noah/code/punkin-pi/packages/coding-agent node_modules/@mariozechner/pi-coding-agent
   ln -sf /Users/noah/code/punkin-pi/packages/ai node_modules/@mariozechner/pi-ai
   ```

3. **Restart punkin** to load the package.

### One-Liner

For a package installed at `/opt/homebrew/lib/node_modules/<pkg>`:

```bash
PKG=/opt/homebrew/lib/node_modules/<package-name> && \
mkdir -p $PKG/node_modules/@mariozechner && \
ln -sf /Users/noah/code/punkin-pi/packages/tui $PKG/node_modules/@mariozechner/pi-tui && \
ln -sf /Users/noah/code/punkin-pi/packages/coding-agent $PKG/node_modules/@mariozechner/pi-coding-agent && \
ln -sf /Users/noah/code/punkin-pi/packages/ai $PKG/node_modules/@mariozechner/pi-ai
```

## Caveats

- Symlinks point to local punkin source. If punkin moves, links break.
- API drift: if punkin's packages diverge from pi's, packages may break at runtime.
- Global installs go to `/opt/homebrew/lib/node_modules/` (Homebrew node) or `~/.npm/` depending on setup.

## Example: pi-mcp-adapter

```bash
punkin install npm:pi-mcp-adapter

PKG=/opt/homebrew/lib/node_modules/pi-mcp-adapter && \
mkdir -p $PKG/node_modules/@mariozechner && \
ln -sf /Users/noah/code/punkin-pi/packages/tui $PKG/node_modules/@mariozechner/pi-tui && \
ln -sf /Users/noah/code/punkin-pi/packages/coding-agent $PKG/node_modules/@mariozechner/pi-coding-agent && \
ln -sf /Users/noah/code/punkin-pi/packages/ai $PKG/node_modules/@mariozechner/pi-ai
```

Then restart punkin. `/mcp` command should work.

## MCP Configuration

After installing pi-mcp-adapter, create `~/.punkin/agent/mcp.json`:

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "some-mcp-server"]
    }
  }
}
```

Or for HTTP-based servers:

```json
{
  "mcpServers": {
    "vers": {
      "url": "https://docs.vers.sh/mcp",
      "lifecycle": "lazy"
    }
  }
}
```

Use via the `mcp` tool:
```
mcp({ search: "query" })           # discover tools
mcp({ tool: "name", args: '{}' })  # call tool
```

Or run `/mcp` for interactive config panel.
