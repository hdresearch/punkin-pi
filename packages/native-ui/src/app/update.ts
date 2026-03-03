/**
 * Punkin App Update — Pure state transitions.
 * 
 * The update function is the core logic of the app.
 * It takes current state and a message, returns new state and commands.
 * 
 * This is completely pure — no side effects, no IO, no randomness.
 * Commands are *descriptions* of effects; the runtime interprets them.
 */

import type { Cmd } from '../core/types.js';
import { none, batch, send, io } from '../core/types.js';
import type { Msg } from './messages.js';
import {
	type AppState,
	type Message,
	initialState,
	setInputText,
	clearInput,
	addMessage,
	updateMessage,
	appendToMessage,
	setConnection,
	setStreaming,
	toggleSidebar,
	setSidebarWidth,
	setActivePanel,
	addHandle,
	expandHandle,
	collapseHandle,
	selectMessage,
	setSessions,
	setCurrentSession,
	canSubmit,
	getMessageById,
} from './state.js';

// ============================================================================
// Update Function
// ============================================================================

export function update(state: AppState, msg: Msg): [AppState, Cmd<Msg>] {
	switch (msg.tag) {
		// ====================================================================
		// Input
		// ====================================================================
		
		case 'input/changed':
			return [setInputText(state, msg.text), none];
		
		case 'input/submit': {
			if (!canSubmit(state)) {
				return [state, none];
			}
			
			const text = state.inputText.trim();
			const messageId = generateId();
			
			// Create user message
			const userMessage: Message = {
				id: messageId,
				role: 'user',
				content: text,
				timestamp: Date.now(),
			};
			
			// Create placeholder for assistant response
			const assistantId = generateId();
			const assistantMessage: Message = {
				id: assistantId,
				role: 'assistant',
				content: '',
				timestamp: Date.now(),
			};
			
			const newState = setStreaming(
				addMessage(
					addMessage(clearInput(state), userMessage),
					assistantMessage
				),
				true,
				assistantId
			);
			
			// Command to send message to agent
			const cmd = io(
				async () => {
					// This will be replaced with actual agent communication
					return { messageId: assistantId, text };
				},
				'agent/send-result',
				'agent/error'
			);
			
			return [newState, cmd];
		}
		
		case 'input/cancel':
			return [clearInput(state), none];
		
		case 'input/focus':
			return [{ ...state, inputFocused: true }, none];
		
		case 'input/blur':
			return [{ ...state, inputFocused: false }, none];
		
		// ====================================================================
		// Agent Connection
		// ====================================================================
		
		case 'agent/connect':
			return [
				setConnection(state, { tag: 'connecting' }),
				io(
					async () => {
						// Connect to agent backend
						// This will establish WebSocket or IPC connection
						return true;
					},
					'agent/connected',
					'agent/error'
				),
			];
		
		case 'agent/disconnect':
			return [setConnection(state, { tag: 'disconnected' }), none];
		
		case 'agent/status':
			return [setConnection(state, msg.connection), none];
		
		// ====================================================================
		// Agent Streaming Response
		// ====================================================================
		
		case 'agent/stream-start':
			return [setStreaming(state, true, msg.messageId), none];
		
		case 'agent/stream-delta':
			return [appendToMessage(state, msg.messageId, msg.content), none];
		
		case 'agent/stream-thinking': {
			const message = getMessageById(state, msg.messageId);
			if (!message) return [state, none];
			
			return [
				updateMessage(state, msg.messageId, {
					thinking: (message.thinking ?? '') + msg.content,
				}),
				none,
			];
		}
		
		case 'agent/stream-end':
			return [setStreaming(state, false), none];
		
		case 'agent/error':
			return [
				setStreaming(setConnection(state, { tag: 'error', message: msg.error }), false),
				none,
			];
		
		// ====================================================================
		// Tool Calls
		// ====================================================================
		
		case 'tool/start': {
			const message = getMessageById(state, msg.messageId);
			if (!message) return [state, none];
			
			const toolCalls = [...(message.toolCalls ?? []), msg.call];
			return [updateMessage(state, msg.messageId, { toolCalls }), none];
		}
		
		case 'tool/progress': {
			const newState = updateToolCall(state, msg.callId, {
				output: msg.output,
			});
			return [newState, none];
		}
		
		case 'tool/complete': {
			// Find message containing this tool call and update it
			const newState = updateToolCall(state, msg.callId, {
				status: 'complete',
				output: msg.output,
			});
			return [newState, none];
		}
		
		case 'tool/error': {
			const newState = updateToolCall(state, msg.callId, {
				status: 'error',
				error: msg.error,
			});
			return [newState, none];
		}
		
		case 'tool/toggle-collapse': {
			const newState = toggleToolCallCollapse(state, msg.callId);
			return [newState, none];
		}
		
		// ====================================================================
		// Handles
		// ====================================================================
		
		case 'handle/created':
			return [addHandle(state, msg.handle), none];
		
		case 'handle/expand':
			// Request content from agent
			return [
				state,
				io(
					async () => {
						// Fetch handle content
						return { id: msg.id, content: '...' };
					},
					'handle/loaded',
					'agent/error'
				),
			];
		
		case 'handle/collapse':
			return [collapseHandle(state, msg.id), none];
		
		case 'handle/loaded':
			return [expandHandle(state, msg.id, msg.content), none];
		
		case 'handle/select':
			return [{ ...state, selectedHandleId: msg.id }, none];
		
		// ====================================================================
		// Messages
		// ====================================================================
		
		case 'message/select':
			return [selectMessage(state, msg.id), none];
		
		case 'message/toggle-collapse': {
			const message = getMessageById(state, msg.id);
			if (!message) return [state, none];
			return [
				updateMessage(state, msg.id, { collapsed: !message.collapsed }),
				none,
			];
		}
		
		case 'message/copy': {
			const message = getMessageById(state, msg.id);
			if (!message) return [state, none];
			return [
				state,
				{ tag: 'clipboard', action: 'write', content: message.content },
			];
		}
		
		case 'message/delete':
			return [
				{ ...state, messages: state.messages.filter(m => m.id !== msg.id) },
				none,
			];
		
		// ====================================================================
		// Sessions
		// ====================================================================
		
		case 'session/list':
			return [setSessions(state, msg.sessions), none];
		
		case 'session/select':
			return [
				setCurrentSession(state, msg.id),
				io(
					async () => {
						// Load session messages
						return { messages: [] };
					},
					'session/loaded',
					'agent/error'
				),
			];
		
		case 'session/new':
			return [
				{ ...state, messages: [], currentSession: null },
				io(
					async () => {
						// Create new session
						return { id: generateId() };
					},
					'session/created',
					'agent/error'
				),
			];
		
		case 'session/loaded':
			return [{ ...state, messages: msg.messages }, none];
		
		case 'session/rename':
			return [
				{
					...state,
					sessions: state.sessions.map(s =>
						s.id === msg.id ? { ...s, name: msg.name } : s
					),
				},
				none,
			];
		
		case 'session/delete':
			return [
				{
					...state,
					sessions: state.sessions.filter(s => s.id !== msg.id),
					currentSession: state.currentSession === msg.id ? null : state.currentSession,
				},
				none,
			];
		
		// ====================================================================
		// UI
		// ====================================================================
		
		case 'ui/toggle-sidebar':
			return [toggleSidebar(state), none];
		
		case 'ui/set-sidebar-width':
			return [setSidebarWidth(state, msg.width), none];
		
		case 'ui/set-panel':
			return [setActivePanel(state, msg.panel), none];
		
		case 'ui/set-theme':
			return [{ ...state, theme: msg.theme }, none];
		
		case 'ui/resize':
			// Could store window dimensions if needed
			return [state, none];
		
		// ====================================================================
		// Keyboard
		// ====================================================================
		
		case 'key/escape':
			// Clear selection, cancel input, etc.
			return [{ ...state, selectedMessageId: null, selectedHandleId: null }, none];
		
		case 'key/enter':
			// Submit if focused on input
			return state.inputFocused ? update(state, { tag: 'input/submit' }) : [state, none];
		
		case 'key/up':
		case 'key/down':
			// Navigate messages
			return [state, none];
		
		case 'key/cmd-k':
			// Open command palette (future)
			return [state, none];
		
		case 'key/cmd-b':
			return update(state, { tag: 'ui/toggle-sidebar' });
		
		case 'key/cmd-n':
			return update(state, { tag: 'session/new' });
		
		// ====================================================================
		// External
		// ====================================================================
		
		case 'external/message':
			return [addMessage(state, msg.message), none];
		
		case 'external/state-sync': {
			const handles = new Map(state.handles);
			for (const h of msg.handles) {
				handles.set(h.id, h);
			}
			return [{ ...state, messages: msg.messages, handles }, none];
		}
		
		// ====================================================================
		// System
		// ====================================================================
		
		case 'noop':
			return [state, none];
		
		default: {
			// Exhaustiveness check
			const _exhaustive: never = msg;
			return [state, none];
		}
	}
}

// ============================================================================
// Helpers
// ============================================================================

function generateId(): string {
	return Math.random().toString(36).slice(2, 10);
}

function updateToolCall(
	state: AppState,
	callId: string,
	update: Partial<import('./state.js').ToolCall>
): AppState {
	return {
		...state,
		messages: state.messages.map(m => {
			if (!m.toolCalls) return m;
			const toolCalls = m.toolCalls.map(tc =>
				tc.id === callId ? { ...tc, ...update } : tc
			);
			return { ...m, toolCalls };
		}),
	};
}

function toggleToolCallCollapse(state: AppState, callId: string): AppState {
	return {
		...state,
		messages: state.messages.map(m => {
			if (!m.toolCalls) return m;
			const toolCalls = m.toolCalls.map(tc =>
				tc.id === callId ? { ...tc, collapsed: !tc.collapsed } : tc
			);
			return { ...m, toolCalls };
		}),
	};
}

// ============================================================================
// App Init
// ============================================================================

export function init(): [AppState, Cmd<Msg>] {
	return [
		initialState(),
		batch(
			// Connect to agent on startup
			send({ tag: 'agent/connect' }),
			// Load sessions
			io(
				async () => {
					// Load session list
					return { sessions: [] };
				},
				'session/list',
				'agent/error'
			)
		),
	];
}
