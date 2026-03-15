import { createRequire } from "module";

export type ClipboardModule = {
	hasImage: () => boolean;
	getImageBinary: () => Promise<Array<number>>;
};

const require = createRequire(import.meta.url);
let clipboard: ClipboardModule | null = null;
let clipboardModuleName: string | null = null;

const hasDisplay = process.platform !== "linux" || Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
const CLIPBOARD_MODULE_CANDIDATES = ["@cwilson613/clipboard", "@mariozechner/clipboard"] as const;

if (!process.env.TERMUX_VERSION && hasDisplay) {
	for (const moduleName of CLIPBOARD_MODULE_CANDIDATES) {
		try {
			clipboard = require(moduleName) as ClipboardModule;
			clipboardModuleName = moduleName;
			break;
		} catch {
			// Try the next known package scope.
		}
	}
}

export { clipboard, clipboardModuleName };
