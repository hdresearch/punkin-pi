/**
 * Renderer — Interprets View → AppKit.
 * 
 * This is the effectful part that turns pure View data into native widgets.
 * Isolated from view.ts so the View DSL stays pure.
 */

import type { View, Color, TextStyle, Insets, Distribution } from './view.js';
import * as ffi from './ffi.js';

// ============================================================================
// Render a View tree to AppKit
// ============================================================================

export function render(view: View): ffi.Id {
  switch (view.tag) {
    case 'vstack':
      return renderStack(view.children, true, view.spacing, view.insets, view.distribution);
    
    case 'hstack':
      return renderStack(view.children, false, view.spacing, view.insets, view.distribution);
    
    case 'scroll':
      return renderScroll(view.child);
    
    case 'text':
      return renderText(view.content, view.style, view.maxWidth);
    
    case 'input':
      return renderInput(view.placeholder);
    
    case 'button':
      return renderButton(view.label);
    
    case 'box':
      return renderBox(render(view.child), view.fill, view.radius);
    
    case 'spacer':
      return renderSpacer();
    
    case 'layer':
      return renderLayer(render(view.child), view.background);
    
    case 'sized':
      return renderSized(render(view.child), view.width, view.height);
    
    case 'textArea':
      return renderTextArea(view.placeholder, view.minHeight);
    
    case 'splitV':
      return renderSplitV(render(view.top), render(view.bottom), view.dividerPos);
    
    case 'vibrancy':
      return ffi.createVibrancyView(render(view.child), view.material ?? 7);
  }
}

// ============================================================================
// Widget renderers
// ============================================================================

function distributionToNative(d: Distribution): number {
  switch (d) {
    case 'fill': return ffi.Distribution.fill;
    case 'gravity': return ffi.Distribution.gravity;
    case 'equalSpacing': return ffi.Distribution.equalSpacing;
  }
}

function renderStack(children: View[], vertical: boolean, spacing: number, insets: Insets, distribution: Distribution): ffi.Id {
  const stack = ffi.init(ffi.alloc('NSStackView'));
  ffi.sendInt(stack, 'setOrientation:', vertical ? 1 : 0);
  ffi.sendDouble(stack, 'setSpacing:', spacing);
  ffi.sendUInt(stack, 'setAlignment:', vertical ? 1 : 512); // leading / centerY
  ffi.sendUInt(stack, 'setDistribution:', distributionToNative(distribution));
  ffi.sendBool(stack, 'setTranslatesAutoresizingMaskIntoConstraints:', false);
  ffi.sendInsets(stack, 'setEdgeInsets:', insets.top, insets.left, insets.bottom, insets.right);
  
  for (const child of children) {
    ffi.send(stack, 'addArrangedSubview:', render(child));
  }
  
  return stack;
}

function renderScroll(child: View): ffi.Id {
  const scroll = ffi.init(ffi.alloc('NSScrollView'));
  ffi.sendBool(scroll, 'setHasVerticalScroller:', true);
  ffi.sendBool(scroll, 'setHasHorizontalScroller:', false);
  ffi.sendInt(scroll, 'setBorderType:', 0);
  ffi.sendBool(scroll, 'setDrawsBackground:', false);
  ffi.sendBool(scroll, 'setTranslatesAutoresizingMaskIntoConstraints:', false);
  
  // Always show scrollbars (old-timey style)
  ffi.sendInt(scroll, 'setScrollerStyle:', 0); // 0 = legacy, 1 = overlay
  const vScroller = ffi.call(scroll, 'verticalScroller');
  ffi.sendInt(vScroller, 'setScrollerStyle:', 0);
  
  const doc = render(child);
  ffi.send(scroll, 'setDocumentView:', doc);
  
  // Scroll views should expand (low hugging = wants to grow)
  ffi.setHuggingPriority(scroll, ffi.Priority.low, 0); // horizontal
  ffi.setHuggingPriority(scroll, ffi.Priority.low, 1); // vertical
  
  return scroll;
}

function renderText(content: string, style: TextStyle, maxWidth?: number): ffi.Id {
  const label = ffi.init(ffi.alloc('NSTextField'));
  ffi.send(label, 'setStringValue:', ffi.nsString(content));
  ffi.sendBool(label, 'setBezeled:', false);
  ffi.sendBool(label, 'setDrawsBackground:', false);
  ffi.sendBool(label, 'setEditable:', false);
  ffi.sendBool(label, 'setSelectable:', true);
  ffi.sendBool(label, 'setTranslatesAutoresizingMaskIntoConstraints:', false);
  
  const font = style.mono 
    ? ffi.nsFontMono(style.size, style.weight)
    : ffi.nsFont(style.size, style.weight);
  ffi.send(label, 'setFont:', font);
  ffi.send(label, 'setTextColor:', ffi.nsColor(style.color));
  
  if (maxWidth) {
    ffi.sendDouble(label, 'setPreferredMaxLayoutWidth:', maxWidth);
    ffi.sendInt(label, 'setLineBreakMode:', 0); // word wrap
  }
  
  return label;
}

function renderInput(placeholder: string): ffi.Id {
  const field = ffi.init(ffi.alloc('NSTextField'));
  ffi.send(field, 'setPlaceholderString:', ffi.nsString(placeholder));
  ffi.sendBool(field, 'setBezeled:', true);
  ffi.sendInt(field, 'setBezelStyle:', 1);
  ffi.send(field, 'setFont:', ffi.nsFont(14));
  ffi.send(field, 'setTextColor:', ffi.nsColor({ r: 0.1, g: 0.1, b: 0.1, a: 1 }));
  ffi.send(field, 'setBackgroundColor:', ffi.nsColor({ r: 1, g: 1, b: 1, a: 1 }));
  ffi.sendBool(field, 'setTranslatesAutoresizingMaskIntoConstraints:', false);
  return field;
}

function renderButton(label: string): ffi.Id {
  const btn = ffi.init(ffi.alloc('NSButton'));
  ffi.send(btn, 'setTitle:', ffi.nsString(label));
  ffi.sendInt(btn, 'setBezelStyle:', 1);
  ffi.sendBool(btn, 'setTranslatesAutoresizingMaskIntoConstraints:', false);
  return btn;
}

function renderBox(content: ffi.Id, fill: Color, radius: number): ffi.Id {
  // Use NSView with layer instead of NSBox for better intrinsic sizing
  const view = ffi.init(ffi.alloc('NSView'));
  ffi.sendBool(view, 'setTranslatesAutoresizingMaskIntoConstraints:', false);
  ffi.sendBool(view, 'setWantsLayer:', true);
  
  const layer = ffi.call(view, 'layer');
  ffi.send(layer, 'setBackgroundColor:', ffi.call(ffi.nsColor(fill), 'CGColor'));
  ffi.sendDouble(layer, 'setCornerRadius:', radius);
  
  // Add content as subview and pin to edges
  ffi.send(view, 'addSubview:', content);
  ffi.pinToParent(content, view);
  
  return view;
}

function renderSpacer(): ffi.Id {
  const view = ffi.init(ffi.alloc('NSView'));
  ffi.sendBool(view, 'setTranslatesAutoresizingMaskIntoConstraints:', false);
  return view;
}

function renderLayer(content: ffi.Id, background: Color): ffi.Id {
  // Wrap content in a view with a background layer
  const wrapper = ffi.init(ffi.alloc('NSStackView'));
  ffi.sendInt(wrapper, 'setOrientation:', 1);
  ffi.sendDouble(wrapper, 'setSpacing:', 0);
  ffi.sendBool(wrapper, 'setTranslatesAutoresizingMaskIntoConstraints:', false);
  ffi.sendBool(wrapper, 'setWantsLayer:', true);
  
  const layer = ffi.call(wrapper, 'layer');
  const cgColor = ffi.call(ffi.nsColor(background), 'CGColor');
  ffi.send(layer, 'setBackgroundColor:', cgColor);
  
  ffi.send(wrapper, 'addArrangedSubview:', content);
  return wrapper;
}

function renderSized(content: ffi.Id, width?: number, height?: number): ffi.Id {
  // Wrap in a view with explicit size constraints
  const wrapper = ffi.init(ffi.alloc('NSView'));
  ffi.sendBool(wrapper, 'setTranslatesAutoresizingMaskIntoConstraints:', false);
  ffi.send(wrapper, 'addSubview:', content);
  ffi.pinToParent(content, wrapper);
  
  if (width !== undefined) {
    ffi.setWidthConstraint(wrapper, width);
  }
  if (height !== undefined) {
    ffi.setHeightConstraint(wrapper, height);
  }
  
  return wrapper;
}

function renderTextArea(placeholder: string, minHeight: number): ffi.Id {
  // Use NSTextView wrapped in NSScrollView for multi-line input
  const scrollView = ffi.init(ffi.alloc('NSScrollView'));
  ffi.sendBool(scrollView, 'setHasVerticalScroller:', true);
  ffi.sendBool(scrollView, 'setHasHorizontalScroller:', false);
  ffi.sendInt(scrollView, 'setBorderType:', 1); // bezel border
  ffi.sendBool(scrollView, 'setTranslatesAutoresizingMaskIntoConstraints:', false);
  
  const textView = ffi.init(ffi.alloc('NSTextView'));
  ffi.sendBool(textView, 'setRichText:', false);
  ffi.sendBool(textView, 'setEditable:', true);
  ffi.sendBool(textView, 'setSelectable:', true);
  ffi.send(textView, 'setFont:', ffi.nsFont(14));
  ffi.send(textView, 'setTextColor:', ffi.nsColor({ r: 0.1, g: 0.1, b: 0.1, a: 1 }));
  ffi.send(textView, 'setBackgroundColor:', ffi.nsColor({ r: 1, g: 1, b: 1, a: 1 }));
  
  // Set placeholder - NSTextView doesn't have native placeholder, would need delegate
  // For now just leave empty
  
  ffi.send(scrollView, 'setDocumentView:', textView);
  
  // Set minimum height
  ffi.setHeightConstraint(scrollView, minHeight);
  
  return scrollView;
}

function renderSplitV(top: ffi.Id, bottom: ffi.Id, _dividerPos?: number): ffi.Id {
  const split = ffi.init(ffi.alloc('NSSplitView'));
  ffi.sendBool(split, 'setVertical:', false); // false = horizontal divider (top/bottom split)
  ffi.sendInt(split, 'setDividerStyle:', 1); // 1 = thick divider (more visible, obviously draggable)
  ffi.sendBool(split, 'setTranslatesAutoresizingMaskIntoConstraints:', false);
  
  ffi.send(split, 'addArrangedSubview:', top);
  ffi.send(split, 'addArrangedSubview:', bottom);
  
  // TODO: setPosition:ofDividerAt: crashes - need to call after layout or use delegate
  // For now, let it use default 50/50 split
  
  return split;
}

// ============================================================================
// App runner
// ============================================================================

export function runApp(title: string, width: number, height: number, content: View): void {
  const win = ffi.createWindow(title, { x: 150, y: 100, width, height });
  ffi.send(win, 'setBackgroundColor:', ffi.nsColor({ r: 0.98, g: 0.98, b: 0.98, a: 1 }));
  
  const contentView = ffi.call(win, 'contentView');
  const rendered = render(content);
  ffi.send(contentView, 'addSubview:', rendered);
  
  // Pin rendered content to fill window
  ffi.pinToParent(rendered, contentView);
  
  // HIG: every Mac app needs a menu bar
  ffi.createMenuBar(title);
  
  ffi.showWindow(win, contentView);
  ffi.runApp();
}
