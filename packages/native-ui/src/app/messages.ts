/**
 * Punkin App Messages — All possible events.
 * 
 * This is the complete set of things that can happen.
 * Each variant carries its payload; update() pattern-matches on these.
 */

import type { Session, Message, Handle, ToolCall, ConnectionState } from './state.js';

// ============================================================================
// Message Type (Sum Type)
// ============================================================================

export type Msg =
	// User Input
	| { tag: 'input/changed'; text: string }
	| { tag: 'input/submit' }
	| { tag: 'input/cancel' }
	| { tag: 'input/focus' }
	| { tag: 'input/blur' }
	
	// Agent Connection
	| { tag: 'agent/connect' }
	| { tag: 'agent/disconnect' }
	| { tag: 'agent/status'; connection: ConnectionState }
	
	// Agent Response (streaming)
	| { tag: 'agent/stream-start'; messageId: string }
	| { tag: 'agent/stream-delta'; messageId: string; content: string }
	| { tag: 'agent/stream-thinking'; messageId: string; content: string }
	| { tag: 'agent/stream-end'; messageId: string }
	| { tag: 'agent/error'; error: string }
	
	// Tool Calls
	| { tag: 'tool/start'; messageId: string; call: ToolCall }
	| { tag: 'tool/progress'; callId: string; output: string }
	| { tag: 'tool/complete'; callId: string; output: string }
	| { tag: 'tool/error'; callId: string; error: string }
	| { tag: 'tool/toggle-collapse'; callId: string }
	
	// Handles
	| { tag: 'handle/created'; handle: Handle }
	| { tag: 'handle/expand'; id: string }
	| { tag: 'handle/collapse'; id: string }
	| { tag: 'handle/loaded'; id: string; content: string }
	| { tag: 'handle/select'; id: string | null }
	
	// Messages
	| { tag: 'message/select'; id: string | null }
	| { tag: 'message/toggle-collapse'; id: string }
	| { tag: 'message/copy'; id: string }
	| { tag: 'message/delete'; id: string }
	
	// Sessions
	| { tag: 'session/list'; sessions: Session[] }
	| { tag: 'session/select'; id: string }
	| { tag: 'session/new' }
	| { tag: 'session/rename'; id: string; name: string }
	| { tag: 'session/delete'; id: string }
	| { tag: 'session/loaded'; messages: Message[] }
	
	// UI
	| { tag: 'ui/toggle-sidebar' }
	| { tag: 'ui/set-sidebar-width'; width: number }
	| { tag: 'ui/set-panel'; panel: 'chat' | 'files' | 'search' }
	| { tag: 'ui/set-theme'; theme: 'light' | 'dark' | 'system' }
	| { tag: 'ui/resize'; width: number; height: number }
	
	// Keyboard Shortcuts
	| { tag: 'key/escape' }
	| { tag: 'key/enter' }
	| { tag: 'key/up' }
	| { tag: 'key/down' }
	| { tag: 'key/cmd-k' }   // Command palette / search
	| { tag: 'key/cmd-b' }   // Toggle sidebar
	| { tag: 'key/cmd-n' }   // New session
	
	// External (from outside the GUI, e.g., agent process)
	| { tag: 'external/message'; message: Message }
	| { tag: 'external/state-sync'; messages: Message[]; handles: Handle[] }
	
	// System
	| { tag: 'noop' };

// ============================================================================
// Message Constructors
// ============================================================================

// Input
export const inputChanged = (text: string): Msg => ({ tag: 'input/changed', text });
export const inputSubmit: Msg = { tag: 'input/submit' };
export const inputCancel: Msg = { tag: 'input/cancel' };

// Agent
export const agentConnect: Msg = { tag: 'agent/connect' };
export const agentDisconnect: Msg = { tag: 'agent/disconnect' };
export const agentStatus = (connection: ConnectionState): Msg => 
	({ tag: 'agent/status', connection });

// Streaming
export const streamStart = (messageId: string): Msg => 
	({ tag: 'agent/stream-start', messageId });
export const streamDelta = (messageId: string, content: string): Msg =>
	({ tag: 'agent/stream-delta', messageId, content });
export const streamThinking = (messageId: string, content: string): Msg =>
	({ tag: 'agent/stream-thinking', messageId, content });
export const streamEnd = (messageId: string): Msg =>
	({ tag: 'agent/stream-end', messageId });

// Tools
export const toolStart = (messageId: string, call: ToolCall): Msg =>
	({ tag: 'tool/start', messageId, call });
export const toolComplete = (callId: string, output: string): Msg =>
	({ tag: 'tool/complete', callId, output });
export const toolError = (callId: string, error: string): Msg =>
	({ tag: 'tool/error', callId, error });

// Handles
export const handleExpand = (id: string): Msg => ({ tag: 'handle/expand', id });
export const handleCollapse = (id: string): Msg => ({ tag: 'handle/collapse', id });
export const handleLoaded = (id: string, content: string): Msg =>
	({ tag: 'handle/loaded', id, content });

// Messages
export const messageSelect = (id: string | null): Msg => ({ tag: 'message/select', id });
export const messageCopy = (id: string): Msg => ({ tag: 'message/copy', id });

// Sessions
export const sessionSelect = (id: string): Msg => ({ tag: 'session/select', id });
export const sessionNew: Msg = { tag: 'session/new' };

// UI
export const toggleSidebar: Msg = { tag: 'ui/toggle-sidebar' };
export const setPanel = (panel: 'chat' | 'files' | 'search'): Msg =>
	({ tag: 'ui/set-panel', panel });

// Keys
export const keyEscape: Msg = { tag: 'key/escape' };
export const keyEnter: Msg = { tag: 'key/enter' };
export const keyCmdK: Msg = { tag: 'key/cmd-k' };
export const keyCmdB: Msg = { tag: 'key/cmd-b' };
export const keyCmdN: Msg = { tag: 'key/cmd-n' };

// System
export const noop: Msg = { tag: 'noop' };
