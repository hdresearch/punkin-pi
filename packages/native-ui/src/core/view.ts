/**
 * View DSL — Smart constructors for building view trees.
 * 
 * These are just functions that return View data structures.
 * No side effects, no mutation, no hidden state.
 */

import type {
	View,
	VStack,
	HStack,
	ZStack,
	Text,
	TextEditor,
	SplitView,
	ScrollView,
	TreeView,
	TreeNode,
	Button,
	Spacer,
	Empty,
	BaseAttrs,
	TextStyle,
	MsgTag,
	Color,
	Insets,
} from './types.js';

// ============================================================================
// Attribute Helpers
// ============================================================================

const emptyAttrs: BaseAttrs = {};

export function attrs(a: BaseAttrs): BaseAttrs {
	return a;
}

export function insets(top: number, right: number, bottom: number, left: number): Insets {
	return { top, right, bottom, left };
}

export function insetsAll(n: number): Insets {
	return { top: n, right: n, bottom: n, left: n };
}

export function rgb(r: number, g: number, b: number): Color {
	return { r, g, b, a: 1 };
}

export function rgba(r: number, g: number, b: number, a: number): Color {
	return { r, g, b, a };
}

// Named colors
export const colors = {
	black: rgb(0, 0, 0),
	white: rgb(255, 255, 255),
	transparent: rgba(0, 0, 0, 0),
	// macOS semantic colors (will map to system colors in AppKit)
	label: { r: -1, g: 0, b: 0, a: 1 } as Color, // sentinel for NSColor.labelColor
	secondaryLabel: { r: -1, g: 1, b: 0, a: 1 } as Color,
	background: { r: -1, g: 2, b: 0, a: 1 } as Color,
	secondaryBackground: { r: -1, g: 3, b: 0, a: 1 } as Color,
	accent: { r: -1, g: 4, b: 0, a: 1 } as Color,
} as const;

// ============================================================================
// Layout Containers
// ============================================================================

export function vstack(
	children: View[],
	options: { spacing?: number; attrs?: BaseAttrs } = {}
): VStack {
	return {
		tag: 'vstack',
		children,
		spacing: options.spacing,
		attrs: options.attrs ?? emptyAttrs,
	};
}

export function hstack(
	children: View[],
	options: { spacing?: number; attrs?: BaseAttrs } = {}
): HStack {
	return {
		tag: 'hstack',
		children,
		spacing: options.spacing,
		attrs: options.attrs ?? emptyAttrs,
	};
}

export function zstack(children: View[], options: { attrs?: BaseAttrs } = {}): ZStack {
	return {
		tag: 'zstack',
		children,
		attrs: options.attrs ?? emptyAttrs,
	};
}

// ============================================================================
// Content Views
// ============================================================================

export function text(
	content: string,
	options: { style?: TextStyle; selectable?: boolean; attrs?: BaseAttrs } = {}
): Text {
	return {
		tag: 'text',
		content,
		style: options.style,
		selectable: options.selectable,
		attrs: options.attrs ?? emptyAttrs,
	};
}

export function label(content: string, style?: TextStyle): Text {
	return text(content, { style, selectable: false });
}

export function code(content: string, attrs?: BaseAttrs): Text {
	return text(content, {
		style: { monospace: true, fontSize: 13 },
		selectable: true,
		attrs,
	});
}

export function textEditor(
	content: string,
	options: {
		placeholder?: string;
		style?: TextStyle;
		editable?: boolean;
		onInput?: MsgTag;
		onSubmit?: MsgTag;
		attrs?: BaseAttrs;
	} = {}
): TextEditor {
	return {
		tag: 'texteditor',
		content,
		placeholder: options.placeholder,
		style: options.style,
		editable: options.editable ?? true,
		onInput: options.onInput,
		onSubmit: options.onSubmit,
		attrs: options.attrs ?? emptyAttrs,
	};
}

// ============================================================================
// Container Views
// ============================================================================

export function splitView(
	left: View,
	right: View,
	options: {
		direction?: 'horizontal' | 'vertical';
		dividerPosition?: number;
		attrs?: BaseAttrs;
	} = {}
): SplitView {
	return {
		tag: 'splitview',
		direction: options.direction ?? 'horizontal',
		left,
		right,
		dividerPosition: options.dividerPosition,
		attrs: options.attrs ?? emptyAttrs,
	};
}

export function scrollView(
	child: View,
	options: {
		horizontal?: boolean;
		vertical?: boolean;
		attrs?: BaseAttrs;
	} = {}
): ScrollView {
	return {
		tag: 'scrollview',
		child,
		horizontal: options.horizontal ?? false,
		vertical: options.vertical ?? true,
		attrs: options.attrs ?? emptyAttrs,
	};
}

export function treeView<T>(
	root: TreeNode<T>,
	renderNode: (node: TreeNode<T>) => View,
	options: {
		onSelect?: MsgTag;
		onExpand?: MsgTag;
		attrs?: BaseAttrs;
	} = {}
): TreeView {
	return {
		tag: 'treeview',
		root: root as TreeNode,
		renderNode: renderNode as (node: TreeNode) => View,
		onSelect: options.onSelect,
		onExpand: options.onExpand,
		attrs: options.attrs ?? emptyAttrs,
	};
}

// ============================================================================
// Interactive Views
// ============================================================================

export function button(
	label: string,
	onClick: MsgTag,
	options: { disabled?: boolean; attrs?: BaseAttrs } = {}
): Button {
	return {
		tag: 'button',
		label,
		onClick,
		disabled: options.disabled,
		attrs: options.attrs ?? emptyAttrs,
	};
}

// ============================================================================
// Utility Views
// ============================================================================

export function spacer(attrs?: BaseAttrs): Spacer {
	return { tag: 'spacer', attrs: attrs ?? emptyAttrs };
}

export function empty(): Empty {
	return { tag: 'empty', attrs: emptyAttrs };
}

// ============================================================================
// Conditional & List Helpers
// ============================================================================

export function when(condition: boolean, view: View): View {
	return condition ? view : empty();
}

export function unless(condition: boolean, view: View): View {
	return condition ? empty() : view;
}

export function maybe<T>(value: T | null | undefined, render: (v: T) => View): View {
	return value != null ? render(value) : empty();
}

export function each<T>(items: readonly T[], render: (item: T, index: number) => View): View[] {
	return items.map(render);
}

// ============================================================================
// Tree Helpers
// ============================================================================

export function treeNode<T>(
	id: string,
	data: T,
	children: TreeNode<T>[] = [],
	expanded = false
): TreeNode<T> {
	return { id, data, children, expanded };
}

export function leaf<T>(id: string, data: T): TreeNode<T> {
	return treeNode(id, data, [], false);
}
