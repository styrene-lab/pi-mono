import * as Diff from "diff";
import { getLanguageFromPath, highlightCode, theme } from "../theme/theme.js";

/**
 * Parse diff line to extract prefix, line number, and content.
 * Format: "+123 content" or "-123 content" or " 123 content" or "     ..."
 */
function parseDiffLine(line: string): { prefix: string; lineNum: string; content: string } | null {
	const match = line.match(/^([+-\s])(\s*\d*)\s(.*)$/);
	if (!match) return null;
	return { prefix: match[1], lineNum: match[2], content: match[3] };
}

/**
 * Replace tabs with spaces for consistent rendering.
 */
function replaceTabs(text: string): string {
	return text.replace(/\t/g, "   ");
}

/**
 * Apply a line-level background and re-activate it after any nested bg resets.
 * This ensures intra-line highlight backgrounds don't leak out into the line bg.
 */
function applyLineBg(
	bgColor: "toolDiffAddedBg" | "toolDiffRemovedBg",
	lineContent: string,
): string {
	const bgOn = theme.getBgAnsi(bgColor);
	// After each inline bg-reset (\x1b[49m), re-activate the line background.
	const fixedContent = lineContent.replace(/\x1b\[49m/g, `\x1b[49m${bgOn}`);
	return `${bgOn}${fixedContent}\x1b[49m`;
}

/**
 * Compute word-level diff and render with themed background on changed parts.
 * Returns separate rendered strings for the removed and added lines.
 */
function renderIntraLineDiff(oldContent: string, newContent: string): { removedLine: string; addedLine: string } {
	const wordDiff = Diff.diffWords(oldContent, newContent);

	let removedLine = "";
	let addedLine = "";
	let isFirstRemoved = true;
	let isFirstAdded = true;

	for (const part of wordDiff) {
		if (part.removed) {
			let value = part.value;
			// Strip leading whitespace from the first removed part
			if (isFirstRemoved) {
				const leadingWs = value.match(/^(\s*)/)?.[1] || "";
				value = value.slice(leadingWs.length);
				removedLine += leadingWs;
				isFirstRemoved = false;
			}
			if (value) {
				removedLine += theme.bg("toolDiffRemovedHighlight", value);
			}
		} else if (part.added) {
			let value = part.value;
			// Strip leading whitespace from the first added part
			if (isFirstAdded) {
				const leadingWs = value.match(/^(\s*)/)?.[1] || "";
				value = value.slice(leadingWs.length);
				addedLine += leadingWs;
				isFirstAdded = false;
			}
			if (value) {
				addedLine += theme.bg("toolDiffAddedHighlight", value);
			}
		} else {
			removedLine += part.value;
			addedLine += part.value;
		}
	}

	return { removedLine, addedLine };
}

export interface RenderDiffOptions {
	/** File path — used for syntax highlighting context lines */
	filePath?: string;
}

/**
 * Render a diff string with colored lines, intra-line change highlighting,
 * and syntax highlighting on context lines.
 * - Context lines: syntax-highlighted (if language detected) or dim/gray
 * - Removed lines: Alpharius red bg tint + red fg, with themed highlight on changed tokens
 * - Added lines: Alpharius green bg tint + green fg, with themed highlight on changed tokens
 */
export function renderDiff(diffText: string, options: RenderDiffOptions = {}): string {
	const lines = diffText.split("\n");
	const result: string[] = [];

	// Determine syntax highlighting language from file path
	const lang = options.filePath ? getLanguageFromPath(options.filePath) : undefined;

	// Build a syntax-highlighted lookup for context lines when we have a language.
	// We collect all context line contents, highlight them together for accuracy,
	// then index by their raw content for fast lookup.
	let contextHighlightMap: Map<string, string> | undefined;
	if (lang) {
		const contextContents: string[] = [];
		for (const line of lines) {
			const p = parseDiffLine(line);
			if (p && p.prefix === " ") {
				contextContents.push(replaceTabs(p.content));
			}
		}
		if (contextContents.length > 0) {
			const joined = contextContents.join("\n");
			const highlighted = highlightCode(joined, lang);
			contextHighlightMap = new Map(contextContents.map((raw, i) => [raw, highlighted[i] ?? raw]));
		}
	}

	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		const parsed = parseDiffLine(line);

		if (!parsed) {
			result.push(theme.fg("toolDiffContext", line));
			i++;
			continue;
		}

		if (parsed.prefix === "-") {
			// Collect consecutive removed lines
			const removedLines: { lineNum: string; content: string }[] = [];
			while (i < lines.length) {
				const p = parseDiffLine(lines[i]);
				if (!p || p.prefix !== "-") break;
				removedLines.push({ lineNum: p.lineNum, content: p.content });
				i++;
			}

			// Collect consecutive added lines
			const addedLines: { lineNum: string; content: string }[] = [];
			while (i < lines.length) {
				const p = parseDiffLine(lines[i]);
				if (!p || p.prefix !== "+") break;
				addedLines.push({ lineNum: p.lineNum, content: p.content });
				i++;
			}

			// Intra-line diffing only for 1:1 modified lines
			if (removedLines.length === 1 && addedLines.length === 1) {
				const removed = removedLines[0];
				const added = addedLines[0];

				const { removedLine, addedLine } = renderIntraLineDiff(
					replaceTabs(removed.content),
					replaceTabs(added.content),
				);

				const removedFull = theme.fg("toolDiffRemoved", `-${removed.lineNum} ${removedLine}`);
				const addedFull = theme.fg("toolDiffAdded", `+${added.lineNum} ${addedLine}`);

				result.push(applyLineBg("toolDiffRemovedBg", removedFull));
				result.push(applyLineBg("toolDiffAddedBg", addedFull));
			} else {
				for (const removed of removedLines) {
					const content = theme.fg("toolDiffRemoved", `-${removed.lineNum} ${replaceTabs(removed.content)}`);
					result.push(applyLineBg("toolDiffRemovedBg", content));
				}
				for (const added of addedLines) {
					const content = theme.fg("toolDiffAdded", `+${added.lineNum} ${replaceTabs(added.content)}`);
					result.push(applyLineBg("toolDiffAddedBg", content));
				}
			}
		} else if (parsed.prefix === "+") {
			// Standalone added line
			const content = theme.fg("toolDiffAdded", `+${parsed.lineNum} ${replaceTabs(parsed.content)}`);
			result.push(applyLineBg("toolDiffAddedBg", content));
			i++;
		} else {
			// Context line — syntax-highlight if language available
			const raw = replaceTabs(parsed.content);
			const highlighted = contextHighlightMap?.get(raw) ?? theme.fg("toolDiffContext", raw);
			result.push(` ${parsed.lineNum} ${highlighted}`);
			i++;
		}
	}

	return result.join("\n");
}
