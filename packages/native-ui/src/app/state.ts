/**
 * Punkin App State — The model for the GUI.
 * 
 * This is the single source of truth for the UI.
 * All state is immutable; updates return new state objects.
 */

// ============================================================================
// Core Types
// ============================================================================

/** A message in the conversation */
export interface Message {
	readonly id: string;
	readonly role: 'user' | 'assistant' | 'system';
	readonly content: string;
	readonly timestamp: number;
	readonly thinking?: string;        // Squiggle/reasoning content
	readonly toolCalls?: ToolCall[];   // Pending or completed tool calls
	readonly collapsed?: boolean;      // UI state: is this message collapsed
}

/** A tool call (request + result) */
export interface ToolCall {
	readonly id: string;
	readonly name: string;
	readonly input: Record<string, unknown>;
	readonly status: 'pending' | 'running' | 'complete' | 'error';
	readonly output?: string;
	readonly error?: string;
	readonly collapsed?: boolean;
}

/** A handle reference (from context compaction) */
export interface Handle {
	readonly id: string;           // e.g., "§h7"
	readonly type: string;         // e.g., "read result"
	readonly tokens: number;
	readonly lines: number;
	readonly preview?: string;     // First few lines
	readonly expanded?: boolean;   // UI state
	readonly content?: string;     // Full content if expanded
}

/** Session metadata */
export interface Session {
	readonly id: string;
	readonly name: string;
	readonly created: number;
	readonly modified: number;
	readonly messageCount: number;
}

/** Connection state to agent backend */
export type ConnectionState =
	| { tag: 'disconnected' }
	| { tag: 'connecting' }
	| { tag: 'connected' }
	| { tag: 'error'; message: string };

// ============================================================================
// App State
// ============================================================================

export interface AppState {
	// Connection
	readonly connection: ConnectionState;
	
	// Session
	readonly sessions: readonly Session[];
	readonly currentSession: string | null;
	
	// Conversation
	readonly messages: readonly Message[];
	readonly handles: Map<string, Handle>;
	
	// Input
	readonly inputText: string;
	readonly inputFocused: boolean;
	
	// UI State
	readonly sidebarVisible: boolean;
	readonly sidebarWidth: number;
	readonly activePanel: 'chat' | 'files' | 'search';
	readonly theme: 'light' | 'dark' | 'system';
	
	// Streaming
	readonly streaming: boolean;
	readonly streamingMessageId: string | null;
	
	// Selection
	readonly selectedMessageId: string | null;
	readonly selectedHandleId: string | null;
}

// ============================================================================
// Initial State
// ============================================================================

export function initialState(): AppState {
	return {
		connection: { tag: 'disconnected' },
		sessions: [],
		currentSession: null,
		messages: [],
		handles: new Map(),
		inputText: '',
		inputFocused: true,
		sidebarVisible: true,
		sidebarWidth: 250,
		activePanel: 'chat',
		theme: 'system',
		streaming: false,
		streamingMessageId: null,
		selectedMessageId: null,
		selectedHandleId: null,
	};
}

// ============================================================================
// State Updaters (pure functions)
// ============================================================================

export function addMessage(state: AppState, message: Message): AppState {
	return {
		...state,
		messages: [...state.messages, message],
	};
}

export function updateMessage(
	state: AppState,
	id: string,
	update: Partial<Message>
): AppState {
	return {
		...state,
		messages: state.messages.map(m =>
			m.id === id ? { ...m, ...update } : m
		),
	};
}

export function appendToMessage(
	state: AppState,
	id: string,
	content: string
): AppState {
	return {
		...state,
		messages: state.messages.map(m =>
			m.id === id ? { ...m, content: m.content + content } : m
		),
	};
}

export function setInputText(state: AppState, text: string): AppState {
	return { ...state, inputText: text };
}

export function clearInput(state: AppState): AppState {
	return { ...state, inputText: '' };
}

export function setConnection(state: AppState, connection: ConnectionState): AppState {
	return { ...state, connection };
}

export function setStreaming(state: AppState, streaming: boolean, messageId?: string): AppState {
	return {
		...state,
		streaming,
		streamingMessageId: streaming ? (messageId ?? null) : null,
	};
}

export function toggleSidebar(state: AppState): AppState {
	return { ...state, sidebarVisible: !state.sidebarVisible };
}

export function setSidebarWidth(state: AppState, width: number): AppState {
	return { ...state, sidebarWidth: width };
}

export function setActivePanel(state: AppState, panel: 'chat' | 'files' | 'search'): AppState {
	return { ...state, activePanel: panel };
}

export function addHandle(state: AppState, handle: Handle): AppState {
	const handles = new Map(state.handles);
	handles.set(handle.id, handle);
	return { ...state, handles };
}

export function expandHandle(state: AppState, id: string, content: string): AppState {
	const handle = state.handles.get(id);
	if (!handle) return state;
	
	const handles = new Map(state.handles);
	handles.set(id, { ...handle, expanded: true, content });
	return { ...state, handles };
}

export function collapseHandle(state: AppState, id: string): AppState {
	const handle = state.handles.get(id);
	if (!handle) return state;
	
	const handles = new Map(state.handles);
	handles.set(id, { ...handle, expanded: false });
	return { ...state, handles };
}

export function selectMessage(state: AppState, id: string | null): AppState {
	return { ...state, selectedMessageId: id };
}

export function setSessions(state: AppState, sessions: Session[]): AppState {
	return { ...state, sessions };
}

export function setCurrentSession(state: AppState, id: string | null): AppState {
	return { ...state, currentSession: id };
}

// ============================================================================
// Selectors
// ============================================================================

export function isConnected(state: AppState): boolean {
	return state.connection.tag === 'connected';
}

export function canSubmit(state: AppState): boolean {
	return isConnected(state) && !state.streaming && state.inputText.trim().length > 0;
}

export function getLastMessage(state: AppState): Message | undefined {
	return state.messages[state.messages.length - 1];
}

export function getMessageById(state: AppState, id: string): Message | undefined {
	return state.messages.find(m => m.id === id);
}

export function getHandle(state: AppState, id: string): Handle | undefined {
	return state.handles.get(id);
}
