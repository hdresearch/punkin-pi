/**
 * Punkin App View — Pure UI rendering.
 * 
 * The view function transforms state into a declarative view tree.
 * It's completely pure — same state always produces same view.
 * 
 * The view tree is then diffed against the previous tree,
 * and patches are applied to the native UI.
 */

import type { View, TextStyle } from '../core/types.js';
import {
	vstack,
	hstack,
	text,
	textEditor,
	splitView,
	scrollView,
	button,
	spacer,
	when,
	each,
	attrs,
	insetsAll,
	colors,
} from '../core/view.js';
import type { AppState, Message, Handle, Session, ToolCall } from './state.js';
import { isConnected, canSubmit } from './state.js';

// ============================================================================
// Main View
// ============================================================================

export function view(state: AppState): View {
	return splitView(
		// Sidebar (sessions + navigation)
		when(state.sidebarVisible, sidebar(state)),
		// Main content
		mainContent(state),
		{
			direction: 'horizontal',
			dividerPosition: state.sidebarVisible ? state.sidebarWidth / 1000 : 0,
		}
	);
}

// ============================================================================
// Sidebar
// ============================================================================

function sidebar(state: AppState): View {
	return vstack([
		// Header
		hstack([
			text('Sessions', { style: headerStyle }),
			spacer(),
			button('+', 'session/new'),
		], { spacing: 8, attrs: attrs({ padding: insetsAll(12) }) }),
		
		// Session list
		scrollView(
			vstack(
				each(state.sessions, session => sessionItem(session, state.currentSession === session.id)),
				{ spacing: 4 }
			)
		),
		
		// Footer (connection status)
		connectionStatus(state),
	], {
		attrs: attrs({
			minWidth: 200,
			background: colors.secondaryBackground,
		}),
	});
}

function sessionItem(session: Session, selected: boolean): View {
	return hstack([
		text(session.name, {
			style: selected ? selectedSessionStyle : normalSessionStyle,
			attrs: attrs({ id: `session-${session.id}` }),
		}),
		spacer(),
		text(`${session.messageCount}`, { style: secondaryTextStyle }),
	], {
		spacing: 8,
		attrs: attrs({
			id: `session-row-${session.id}`,
			padding: { top: 8, right: 12, bottom: 8, left: 12 },
			background: selected ? colors.accent : colors.transparent,
		}),
	});
}

function connectionStatus(state: AppState): View {
	const conn = state.connection;
	let statusText: string;
	let statusStyle: TextStyle;
	
	switch (conn.tag) {
		case 'connected':
			statusText = '● Connected';
			statusStyle = { ...secondaryTextStyle, color: { r: 52, g: 199, b: 89, a: 1 } };
			break;
		case 'connecting':
			statusText = '○ Connecting...';
			statusStyle = { ...secondaryTextStyle, color: { r: 255, g: 204, b: 0, a: 1 } };
			break;
		case 'disconnected':
			statusText = '○ Disconnected';
			statusStyle = secondaryTextStyle;
			break;
		case 'error':
			statusText = `● Error: ${conn.message}`;
			statusStyle = { ...secondaryTextStyle, color: { r: 255, g: 69, b: 58, a: 1 } };
			break;
	}
	
	return hstack([
		text(statusText, { style: statusStyle }),
	], {
		attrs: attrs({ padding: insetsAll(12) }),
	});
}

// ============================================================================
// Main Content
// ============================================================================

function mainContent(state: AppState): View {
	return vstack([
		// Toolbar
		toolbar(state),
		
		// Messages
		scrollView(
			vstack(
				each(state.messages, msg => messageView(msg, state)),
				{ spacing: 16, attrs: attrs({ padding: insetsAll(16) }) }
			),
			{ attrs: attrs({ flex: 1 }) }
		),
		
		// Input area
		inputArea(state),
	]);
}

function toolbar(state: AppState): View {
	return hstack([
		button(state.sidebarVisible ? '◀' : '▶', 'ui/toggle-sidebar'),
		spacer(),
		text(state.currentSession ?? 'New Session', { style: headerStyle }),
		spacer(),
		// Panel tabs
		button('Chat', 'ui/set-panel/chat'),
		button('Files', 'ui/set-panel/files'),
		button('Search', 'ui/set-panel/search'),
	], {
		spacing: 8,
		attrs: attrs({
			padding: { top: 8, right: 16, bottom: 8, left: 16 },
			background: colors.secondaryBackground,
		}),
	});
}

// ============================================================================
// Message Views
// ============================================================================

function messageView(msg: Message, state: AppState): View {
	const isSelected = state.selectedMessageId === msg.id;
	
	return vstack([
		// Header (role + timestamp)
		hstack([
			text(msg.role === 'user' ? 'You' : 'Assistant', {
				style: msg.role === 'user' ? userRoleStyle : assistantRoleStyle,
			}),
			spacer(),
			text(formatTime(msg.timestamp), { style: timestampStyle }),
		], { spacing: 8 }),
		
		// Thinking block (if present)
		when(Boolean(msg.thinking && msg.thinking.length > 0), 
			thinkingBlock(msg.thinking ?? '')
		),
		
		// Content
		text(msg.content, {
			style: messageContentStyle,
			selectable: true,
		}),
		
		// Tool calls
		...each(msg.toolCalls ?? [], tc => toolCallView(tc)),
	], {
		spacing: 8,
		attrs: attrs({
			id: `msg-${msg.id}`,
			padding: insetsAll(12),
			background: isSelected ? colors.accent : (
				msg.role === 'user' ? userMessageBg : assistantMessageBg
			),
		}),
	});
}

function thinkingBlock(content: string): View {
	return vstack([
		text('⟨squiggle⟩', { style: thinkingHeaderStyle }),
		text(content, { style: thinkingContentStyle, selectable: true }),
	], {
		spacing: 4,
		attrs: attrs({
			padding: insetsAll(8),
			background: { r: 40, g: 40, b: 45, a: 1 },
		}),
	});
}

function toolCallView(tc: ToolCall): View {
	const statusIcon = tc.status === 'complete' ? '✓' :
		tc.status === 'error' ? '✗' :
		tc.status === 'running' ? '⟳' : '○';
	
	return vstack([
		// Header
		hstack([
			text(`${statusIcon} ${tc.name}`, { style: toolNameStyle }),
			spacer(),
			button(tc.collapsed ? '▶' : '▼', `tool/toggle-collapse/${tc.id}`),
		], { spacing: 8 }),
		
		// Input (collapsed by default)
		when(!tc.collapsed, vstack([
			text('Input:', { style: secondaryTextStyle }),
			text(JSON.stringify(tc.input, null, 2), { style: codeStyle, selectable: true }),
		], { spacing: 4 })),
		
		// Output (if complete)
		when(!tc.collapsed && tc.status === 'complete' && tc.output != null,
			vstack([
				text('Output:', { style: secondaryTextStyle }),
				text(tc.output ?? '', { style: codeStyle, selectable: true }),
			], { spacing: 4 })
		),
		
		// Error (if failed)
		when(tc.status === 'error' && tc.error != null,
			text(tc.error ?? '', { style: errorStyle })
		),
	], {
		spacing: 8,
		attrs: attrs({
			id: `tool-${tc.id}`,
			padding: insetsAll(8),
			background: { r: 30, g: 30, b: 35, a: 1 },
		}),
	});
}

// ============================================================================
// Handle Views
// ============================================================================

export function handleView(handle: Handle, state: AppState): View {
	const isSelected = state.selectedHandleId === handle.id;
	
	return vstack([
		// Header
		hstack([
			text(handle.id, { style: handleIdStyle }),
			text(handle.type, { style: secondaryTextStyle }),
			spacer(),
			text(`${handle.tokens} tokens, ${handle.lines} lines`, { style: secondaryTextStyle }),
			button(handle.expanded ? '▼' : '▶', `handle/${handle.expanded ? 'collapse' : 'expand'}/${handle.id}`),
		], { spacing: 8 }),
		
		// Preview or content
		when(Boolean(handle.expanded && handle.content != null),
			scrollView(
				text(handle.content ?? '', { style: codeStyle, selectable: true }),
				{ attrs: attrs({ maxHeight: 400 }) }
			)
		),
		when(Boolean(!handle.expanded && handle.preview != null),
			text(handle.preview ?? '', { style: previewStyle })
		),
	], {
		spacing: 4,
		attrs: attrs({
			id: `handle-${handle.id}`,
			padding: insetsAll(8),
			background: isSelected ? colors.accent : { r: 35, g: 35, b: 40, a: 1 },
		}),
	});
}

// ============================================================================
// Input Area
// ============================================================================

function inputArea(state: AppState): View {
	const canSend = canSubmit(state);
	
	return hstack([
		textEditor(state.inputText, {
			placeholder: 'Type a message...',
			onInput: 'input/changed',
			onSubmit: 'input/submit',
			style: inputStyle,
			attrs: attrs({ flex: 1, minHeight: 40 }),
		}),
		button(state.streaming ? '■' : '↑', canSend ? 'input/submit' : 'noop', {
			disabled: !canSend && !state.streaming,
		}),
	], {
		spacing: 8,
		attrs: attrs({
			padding: insetsAll(12),
			background: colors.secondaryBackground,
		}),
	});
}

// ============================================================================
// Styles
// ============================================================================

const headerStyle: TextStyle = {
	fontSize: 16,
	fontWeight: 'bold',
	color: colors.label,
};

const normalSessionStyle: TextStyle = {
	fontSize: 13,
	color: colors.label,
};

const selectedSessionStyle: TextStyle = {
	fontSize: 13,
	fontWeight: 'bold',
	color: colors.white,
};

const secondaryTextStyle: TextStyle = {
	fontSize: 12,
	color: colors.secondaryLabel,
};

const userRoleStyle: TextStyle = {
	fontSize: 13,
	fontWeight: 'bold',
	color: { r: 88, g: 86, b: 214, a: 1 }, // Purple
};

const assistantRoleStyle: TextStyle = {
	fontSize: 13,
	fontWeight: 'bold',
	color: { r: 52, g: 199, b: 89, a: 1 }, // Green
};

const timestampStyle: TextStyle = {
	fontSize: 11,
	color: colors.secondaryLabel,
};

const messageContentStyle: TextStyle = {
	fontSize: 14,
	color: colors.label,
	lineHeight: 1.5,
};

const thinkingHeaderStyle: TextStyle = {
	fontSize: 11,
	color: { r: 180, g: 180, b: 190, a: 1 },
	monospace: true,
};

const thinkingContentStyle: TextStyle = {
	fontSize: 12,
	color: { r: 160, g: 160, b: 170, a: 1 },
	monospace: true,
};

const toolNameStyle: TextStyle = {
	fontSize: 12,
	fontWeight: 'bold',
	color: { r: 255, g: 159, b: 10, a: 1 }, // Orange
	monospace: true,
};

const codeStyle: TextStyle = {
	fontSize: 12,
	monospace: true,
	color: colors.label,
};

const errorStyle: TextStyle = {
	fontSize: 12,
	color: { r: 255, g: 69, b: 58, a: 1 }, // Red
};

const handleIdStyle: TextStyle = {
	fontSize: 12,
	fontWeight: 'bold',
	color: { r: 10, g: 132, b: 255, a: 1 }, // Blue
	monospace: true,
};

const previewStyle: TextStyle = {
	fontSize: 12,
	color: colors.secondaryLabel,
	monospace: true,
};

const inputStyle: TextStyle = {
	fontSize: 14,
	color: colors.label,
};

// Background colors
const userMessageBg = { r: 45, g: 45, b: 55, a: 1 };
const assistantMessageBg = { r: 35, g: 35, b: 40, a: 1 };

// ============================================================================
// Utilities
// ============================================================================

function formatTime(timestamp: number): string {
	const date = new Date(timestamp);
	return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
