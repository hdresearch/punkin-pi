/**
 * AppKit Widgets — Higher-level widget creation and management.
 * 
 * Maps our View types to NSView subclasses using koffi bindings.
 */

import type { View, TextStyle, BaseAttrs, TreeNode } from '../../core/types.js';
import {
	getAppKitClasses,
	ObjCObject,
	nsString,
	makeRect,
	makeSize,
	NSUserInterfaceLayoutOrientation,
	NSStackViewDistribution,
	NSSplitViewDividerStyle,
	createFont,
	createColor,
} from './bindings.js';

// ============================================================================
// Widget Handle — Opaque reference to a native view
// ============================================================================

export interface WidgetHandle {
	readonly id: string;
	readonly view: ObjCObject;
	readonly children: WidgetHandle[];
	_textView?: ObjCObject;
}

// ============================================================================
// Widget Creation — View → NSView
// ============================================================================

export function createWidget(view: View, id: string): WidgetHandle {
	switch (view.tag) {
		case 'vstack':
			return createStackView(view.children, 'vertical', view.spacing ?? 8, view.attrs, id);
		
		case 'hstack':
			return createStackView(view.children, 'horizontal', view.spacing ?? 8, view.attrs, id);
		
		case 'zstack':
			return createZStackView(view.children, view.attrs, id);
		
		case 'text':
			return createTextLabel(view.content, view.style, view.selectable ?? false, view.attrs, id);
		
		case 'texteditor':
			return createTextEditor(
				view.content,
				view.placeholder,
				view.style,
				view.editable ?? true,
				view.attrs,
				id
			);
		
		case 'splitview':
			return createSplitView(
				view.left,
				view.right,
				view.direction,
				view.dividerPosition,
				view.attrs,
				id
			);
		
		case 'scrollview':
			return createScrollView(view.child, view.vertical ?? true, view.horizontal ?? false, view.attrs, id);
		
		case 'treeview':
			return createTreeView(view.root, view.renderNode, view.attrs, id);
		
		case 'button':
			return createButton(view.label, view.onClick, view.disabled ?? false, view.attrs, id);
		
		case 'spacer':
			return createSpacer(view.attrs, id);
		
		case 'empty':
			return createEmptyView(view.attrs, id);
	}
}

// ============================================================================
// Stack Views
// ============================================================================

function createStackView(
	children: readonly View[],
	direction: 'horizontal' | 'vertical',
	spacing: number,
	attrs: BaseAttrs,
	id: string
): WidgetHandle {
	const { NSStackView } = getAppKitClasses();
	
	const stack = NSStackView.alloc().init();
	stack.send('setOrientation:',
		direction === 'vertical'
			? NSUserInterfaceLayoutOrientation.Vertical
			: NSUserInterfaceLayoutOrientation.Horizontal
	);
	stack.send('setSpacing:', spacing);
	stack.send('setDistribution:', NSStackViewDistribution.Fill);
	stack.send('setTranslatesAutoresizingMaskIntoConstraints:', false);
	
	// Create child widgets
	const childHandles: WidgetHandle[] = [];
	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		const childId = `${id}.${i}`;
		const handle = createWidget(child, childId);
		stack.send('addArrangedSubview:', handle.view.ptr);
		childHandles.push(handle);
	}
	
	applyBaseAttrs(stack, attrs);
	
	return { id, view: stack, children: childHandles };
}

function createZStackView(
	children: readonly View[],
	attrs: BaseAttrs,
	id: string
): WidgetHandle {
	const { NSView } = getAppKitClasses();
	
	const container = NSView.alloc().init();
	container.send('setTranslatesAutoresizingMaskIntoConstraints:', false);
	
	const childHandles: WidgetHandle[] = [];
	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		const childId = `${id}.${i}`;
		const handle = createWidget(child, childId);
		container.send('addSubview:', handle.view.ptr);
		handle.view.send('setTranslatesAutoresizingMaskIntoConstraints:', false);
		childHandles.push(handle);
	}
	
	applyBaseAttrs(container, attrs);
	
	return { id, view: container, children: childHandles };
}

// ============================================================================
// Text Views
// ============================================================================

function createTextLabel(
	content: string,
	style: TextStyle | undefined,
	selectable: boolean,
	attrs: BaseAttrs,
	id: string
): WidgetHandle {
	const { NSTextField } = getAppKitClasses();
	
	const label = NSTextField.alloc().init();
	label.send('setStringValue:', nsString(content).ptr);
	label.send('setBezeled:', false);
	label.send('setDrawsBackground:', false);
	label.send('setEditable:', false);
	label.send('setSelectable:', selectable);
	label.send('setTranslatesAutoresizingMaskIntoConstraints:', false);
	
	if (style) {
		applyTextStyle(label, style);
	}
	
	applyBaseAttrs(label, attrs);
	
	return { id, view: label, children: [] };
}

function createTextEditor(
	content: string,
	_placeholder: string | undefined,
	style: TextStyle | undefined,
	editable: boolean,
	attrs: BaseAttrs,
	id: string
): WidgetHandle {
	const { NSTextView, NSScrollView } = getAppKitClasses();
	
	// NSTextView needs to be inside an NSScrollView
	const scrollView = NSScrollView.alloc().init();
	scrollView.send('setHasVerticalScroller:', true);
	scrollView.send('setHasHorizontalScroller:', false);
	scrollView.send('setAutohidesScrollers:', true);
	scrollView.send('setTranslatesAutoresizingMaskIntoConstraints:', false);
	
	const textView = NSTextView.alloc().init();
	textView.send('setString:', nsString(content).ptr);
	textView.send('setEditable:', editable);
	textView.send('setRichText:', false);
	textView.send('setAutomaticQuoteSubstitutionEnabled:', false);
	textView.send('setAutomaticDashSubstitutionEnabled:', false);
	textView.send('setAutomaticTextReplacementEnabled:', false);
	
	// Allow horizontal scrolling for code
	textView.send('setHorizontallyResizable:', true);
	textView.send('setVerticallyResizable:', true);
	
	const container = textView.call('textContainer');
	container.send('setWidthTracksTextView:', false);
	container.send('setContainerSize:', makeSize(1e7, 1e7));
	
	if (style) {
		applyTextStyleToTextView(textView, style);
	}
	
	scrollView.send('setDocumentView:', textView.ptr);
	
	applyBaseAttrs(scrollView, attrs);
	
	return { id, view: scrollView, children: [], _textView: textView };
}

// ============================================================================
// Split View
// ============================================================================

function createSplitView(
	left: View,
	right: View,
	direction: 'horizontal' | 'vertical',
	dividerPosition: number | undefined,
	attrs: BaseAttrs,
	id: string
): WidgetHandle {
	const { NSSplitView } = getAppKitClasses();
	
	const splitView = NSSplitView.alloc().init();
	splitView.send('setVertical:', direction === 'horizontal');
	splitView.send('setDividerStyle:', NSSplitViewDividerStyle.Thin);
	splitView.send('setTranslatesAutoresizingMaskIntoConstraints:', false);
	
	const leftHandle = createWidget(left, `${id}.0`);
	const rightHandle = createWidget(right, `${id}.1`);
	
	splitView.send('addArrangedSubview:', leftHandle.view.ptr);
	splitView.send('addArrangedSubview:', rightHandle.view.ptr);
	
	if (dividerPosition !== undefined) {
		splitView.send('setPosition:ofDividerAtIndex:', dividerPosition * 800, 0);
	}
	
	applyBaseAttrs(splitView, attrs);
	
	return { id, view: splitView, children: [leftHandle, rightHandle] };
}

// ============================================================================
// Scroll View
// ============================================================================

function createScrollView(
	child: View,
	vertical: boolean,
	horizontal: boolean,
	attrs: BaseAttrs,
	id: string
): WidgetHandle {
	const { NSScrollView } = getAppKitClasses();
	
	const scrollView = NSScrollView.alloc().init();
	scrollView.send('setHasVerticalScroller:', vertical);
	scrollView.send('setHasHorizontalScroller:', horizontal);
	scrollView.send('setAutohidesScrollers:', true);
	scrollView.send('setTranslatesAutoresizingMaskIntoConstraints:', false);
	
	const childHandle = createWidget(child, `${id}.0`);
	scrollView.send('setDocumentView:', childHandle.view.ptr);
	
	applyBaseAttrs(scrollView, attrs);
	
	return { id, view: scrollView, children: [childHandle] };
}

// ============================================================================
// Tree View (simplified - renders as nested labels for now)
// ============================================================================

function createTreeView(
	root: TreeNode,
	renderNode: (node: TreeNode) => View,
	attrs: BaseAttrs,
	id: string
): WidgetHandle {
	// Simplified: render tree as nested vstack
	function renderTree(node: TreeNode, prefix: string): View[] {
		const views: View[] = [renderNode(node)];
		if (node.expanded && node.children.length > 0) {
			for (const child of node.children) {
				views.push(...renderTree(child, prefix + '  '));
			}
		}
		return views;
	}
	
	const treeViews = renderTree(root, '');
	const container = createStackView(treeViews, 'vertical', 4, attrs, id);
	
	return container;
}

// ============================================================================
// Button
// ============================================================================

function createButton(
	label: string,
	_onClick: string,
	disabled: boolean,
	attrs: BaseAttrs,
	id: string
): WidgetHandle {
	const { NSButton } = getAppKitClasses();
	
	const button = NSButton.alloc().init();
	button.send('setTitle:', nsString(label).ptr);
	button.send('setBezelStyle:', 1); // Rounded
	button.send('setEnabled:', !disabled);
	button.send('setTranslatesAutoresizingMaskIntoConstraints:', false);
	
	applyBaseAttrs(button, attrs);
	
	return { id, view: button, children: [] };
}

// ============================================================================
// Utility Views
// ============================================================================

function createSpacer(attrs: BaseAttrs, id: string): WidgetHandle {
	const { NSView } = getAppKitClasses();
	
	const spacer = NSView.alloc().init();
	spacer.send('setTranslatesAutoresizingMaskIntoConstraints:', false);
	spacer.send('setContentHuggingPriority:forOrientation:', 1, 0);
	spacer.send('setContentHuggingPriority:forOrientation:', 1, 1);
	
	applyBaseAttrs(spacer, attrs);
	
	return { id, view: spacer, children: [] };
}

function createEmptyView(attrs: BaseAttrs, id: string): WidgetHandle {
	const { NSView } = getAppKitClasses();
	
	const view = NSView.alloc().init();
	view.send('setTranslatesAutoresizingMaskIntoConstraints:', false);
	view.send('setHidden:', true);
	
	applyBaseAttrs(view, attrs);
	
	return { id, view, children: [] };
}

// ============================================================================
// Attribute Application
// ============================================================================

function applyBaseAttrs(view: ObjCObject, attrs: BaseAttrs): void {
	if (attrs.background) {
		const color = createColor(
			attrs.background.r,
			attrs.background.g,
			attrs.background.b,
			attrs.background.a
		);
		
		view.send('setWantsLayer:', true);
		const layer = view.call('layer');
		if (!layer.isNull()) {
			const cgColor = color.call('CGColor');
			layer.send('setBackgroundColor:', cgColor.ptr);
		}
	}
}

function applyTextStyle(textField: ObjCObject, style: TextStyle): void {
	const font = createFont(
		style.fontFamily,
		style.fontSize ?? 13,
		style.monospace ?? false
	);
	textField.send('setFont:', font.ptr);
	
	if (style.color) {
		const color = createColor(
			style.color.r,
			style.color.g,
			style.color.b,
			style.color.a
		);
		textField.send('setTextColor:', color.ptr);
	}
}

function applyTextStyleToTextView(textView: ObjCObject, style: TextStyle): void {
	const font = createFont(
		style.fontFamily,
		style.fontSize ?? 13,
		style.monospace ?? false
	);
	textView.send('setFont:', font.ptr);
	
	if (style.color) {
		const color = createColor(
			style.color.r,
			style.color.g,
			style.color.b,
			style.color.a
		);
		textView.send('setTextColor:', color.ptr);
	}
}

// ============================================================================
// Widget Updates
// ============================================================================

export function updateWidgetText(handle: WidgetHandle, content: string): void {
	const view = handle.view;
	const str = nsString(content);
	
	// Try different methods depending on view type
	// NSTextField
	view.send('setStringValue:', str.ptr);
}

export function updateWidgetAttrs(handle: WidgetHandle, attrs: Partial<BaseAttrs>): void {
	applyBaseAttrs(handle.view, attrs as BaseAttrs);
}
