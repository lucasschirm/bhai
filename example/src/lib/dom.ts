/**
 * @file Tiny DOM construction helpers shared by every component.
 *
 * Deliberately minimal: this is not a rendering library, it is the three
 * patterns that were repeated across the old `ui.js` often enough to be worth
 * naming. Everything here builds nodes with `createElement` + `textContent`,
 * never `innerHTML` — see `example/AGENTS.md` on untrusted server text.
 */

/** Options accepted by {@link el}. */
export interface ElementOptions {
	/** `class` attribute value. */
	className?: string
	/** Text content, set via `textContent` so it is never parsed as HTML. */
	text?: string
	/** `data-*` entries. A nullish value skips the attribute entirely. */
	data?: Record<string, string | number | null | undefined>
	/** Inline styles, applied one property at a time. */
	style?: Partial<CSSStyleDeclaration>
	/** Any other attributes, e.g. `title` or `aria-label`. */
	attrs?: Record<string, string>
	/** Children appended in order. */
	children?: (Node | null | undefined)[]
}

/**
 * Create an element with the handful of properties components actually set.
 *
 * @param tag - The tag name to create
 * @param options - Content and attributes to apply
 */
export function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	options: ElementOptions = {},
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag)

	if (options.className) node.className = options.className
	if (options.text !== undefined) node.textContent = options.text

	for (const [key, value] of Object.entries(options.data ?? {})) {
		if (value === null || value === undefined) continue
		node.dataset[key] = String(value)
	}

	for (const [key, value] of Object.entries(options.attrs ?? {})) {
		node.setAttribute(key, value)
	}

	if (options.style) {
		Object.assign(node.style, options.style)
	}

	for (const child of options.children ?? []) {
		if (child) node.appendChild(child)
	}

	return node
}

/**
 * Look up a required element by id, throwing when the markup and the code have
 * drifted apart.
 *
 * The old `ui.js` returned early on every missing element, which turned a typo
 * in `index.html` into a feature that silently does nothing. Components are
 * constructed once at startup against markup that ships in the same commit, so
 * a missing node is a bug worth surfacing immediately.
 *
 * @param id - The element's id attribute
 * @param root - Where to look; defaults to the document
 */
export function byId<T extends HTMLElement = HTMLElement>(
	id: string,
	root: ParentNode = document,
): T {
	const node = root.querySelector<T>(`#${CSS.escape(id)}`)
	if (!node) {
		throw new Error(`Missing required element #${id}`)
	}
	return node
}

/**
 * Build one icon button: a single glyph whose accessible name and tooltip are
 * the same description.
 *
 * @param glyph - The button's visible character
 * @param label - Accessible name (also the tooltip)
 * @param onClick - Click handler
 */
export function iconButton(glyph: string, label: string, onClick: () => void): HTMLButtonElement {
	const button = el("button", {
		className: "mcp-icon-button",
		text: glyph,
		attrs: { type: "button", title: label, "aria-label": label },
	})
	button.addEventListener("click", onClick)
	return button
}

/**
 * Replace an element's children with the given nodes.
 *
 * @param parent - The element to empty and refill
 * @param children - Replacement children
 */
export function replaceChildren(parent: Element, ...children: Node[]): void {
	parent.replaceChildren(...children)
}
