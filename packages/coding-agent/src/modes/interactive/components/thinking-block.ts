import { Container, Markdown, type MarkdownTheme, Text } from "@punkin-pi/tui";
import { getMarkdownTheme, theme } from "../theme/theme.js";

/** Number of lines to show when collapsed */
const PREVIEW_LINES = 3;
/** Max lines to render even when expanded (safety valve) */
const MAX_EXPANDED_LINES = 500;

/**
 * Collapsible thinking block component.
 * Never hidden — always shows content.
 * Collapsed: first 3 lines as preview
 * Expanded: full content (capped at MAX_EXPANDED_LINES to prevent locking)
 */
export class ThinkingBlock extends Container {
	private content: string;
	private lines: string[];
	private expanded: boolean;
	private markdownTheme: MarkdownTheme;
	private header: Text;
	private contentContainer: Container;

	constructor(content: string, expanded: boolean = false, markdownTheme: MarkdownTheme = getMarkdownTheme()) {
		super();
		this.content = content;
		this.lines = content.split("\n");
		this.expanded = expanded;
		this.markdownTheme = markdownTheme;

		// Header with expand/collapse indicator
		this.header = new Text(this.renderHeader(), 1, 0);
		this.addChild(this.header);

		// Content container
		this.contentContainer = new Container();
		this.addChild(this.contentContainer);

		this.updateContent();
	}

	private renderHeader(): string {
		const indicator = this.expanded ? "▼" : "▶";
		const total = this.lines.length;
		const stats = `${total} line${total !== 1 ? "s" : ""}`;
		return theme.fg("thinkingText", `${indicator} Thinking (${stats})`);
	}

	private updateContent(): void {
		this.header.setText(this.renderHeader());
		this.contentContainer.clear();

		const total = this.lines.length;

		if (this.expanded) {
			// Expanded: show full content (capped for safety)
			const cappedLines = this.lines.slice(0, MAX_EXPANDED_LINES);
			const cappedContent = cappedLines.join("\n");
			this.contentContainer.addChild(
				new Markdown(cappedContent, 2, 0, this.markdownTheme, {
					color: (text: string) => theme.fg("thinkingText", text),
					italic: true,
				}),
			);
			if (total > MAX_EXPANDED_LINES) {
				this.contentContainer.addChild(
					new Text(theme.fg("dim", `... (${total - MAX_EXPANDED_LINES} more lines truncated)`), 2, 0),
				);
			}
		} else {
			// Collapsed: show preview
			const previewLines = this.lines.slice(0, PREVIEW_LINES);
			const preview = previewLines.join("\n");
			this.contentContainer.addChild(
				new Markdown(preview, 2, 0, this.markdownTheme, {
					color: (text: string) => theme.fg("thinkingText", text),
					italic: true,
				}),
			);
			const remaining = total - PREVIEW_LINES;
			if (remaining > 0) {
				this.contentContainer.addChild(
					new Text(theme.fg("dim", `... (${remaining} more line${remaining !== 1 ? "s" : ""})`), 2, 0),
				);
			}
		}
	}

	setExpanded(expanded: boolean): void {
		if (this.expanded !== expanded) {
			this.expanded = expanded;
			this.updateContent();
		}
	}

	toggle(): void {
		this.setExpanded(!this.expanded);
	}

	isExpanded(): boolean {
		return this.expanded;
	}

	getContent(): string {
		return this.content;
	}

	setContent(content: string): void {
		this.content = content;
		this.lines = content.split("\n");
		this.updateContent();
	}
}
