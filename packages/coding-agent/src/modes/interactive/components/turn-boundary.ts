import { Container, Text } from "@punkin-pi/tui";
import type { TurnStartMessage, TurnEndMessage } from "@punkin-pi/ai";
import { renderTurnStart, renderTurnEnd } from "../../../core/carter_kit/turn-boundary.js";
import { theme } from "../theme/theme.js";

/**
 * Component that renders a turn boundary (start or end).
 * Uses unicode box drawing, sigil at outermost positions.
 */
export class TurnBoundaryComponent extends Container {
	constructor(message: TurnStartMessage | TurnEndMessage) {
		super();

		const isStart = message.role === "turnStart";
		const text = isStart ? renderTurnStart(message) : renderTurnEnd(message);

		// Bar on outer faces: START above (entry), END below (exit)
		// Creates visual frame around turn content
		const separator = "═".repeat(80);
		
		let content: string;
		if (isStart) {
			// START: bar above, text below
			content = `${separator}\n│ ${text} │`;
		} else {
			// END: text above, bar below
			content = `│ ${text} │\n${separator}`;
		}

		// Dim styling for boundaries — structural, not content
		this.addChild(
			new Text(theme.fg("dim", content)),
		);
	}
}
