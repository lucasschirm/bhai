/**
 * @file The one and only List.js integration point.
 *
 * List.js (https://listjs.com) gives a plain `<ul>` search, sort and filtering.
 * It is used here in its "works on existing HTML" mode: the caller renders the
 * item nodes itself and this adapter only indexes them. `list.add()` is never
 * called — see the SAFETY note below — and no other module imports `list.js`.
 *
 * SAFETY: List.js's templater assigns values with `elm.innerHTML = value`
 * (`list.js@2.3.1`, `src/templater.js`), and its `item` option is an HTML-string
 * template. MCP tool names, tool descriptions and error messages come from
 * whatever endpoint the user pasted a URL for, so feeding them through that path
 * would be an XSS sink. Instead every indexed value is a `data-*` attribute,
 * which List.js reads and writes with `getAttribute`/`setAttribute`, and the
 * visible nodes are built by the components with `createElement`/`textContent`.
 */

import List from "list.js"

/**
 * List.js refuses to construct over a list with no children and no template:
 * `Templater.init()` throws "The list needs to have at least one item on init".
 * A constant placeholder satisfies that check. It is never interpolated with
 * data because `list.add()` is never called — the only code path that would
 * clone it.
 */
const PLACEHOLDER_ITEM = "<li></li>"

/**
 * Class hooks List.js binds to. Prefixed to keep them off the styling class
 * names, so restyling `.mcp-list` cannot accidentally unhook the behavior.
 */
const LIST_CLASS = "js-list"
const SEARCH_CLASS = "js-search"
const SORT_CLASS = "js-sort"

/** Sort direction, matching List.js's `data-order` values. */
export type SortOrder = "asc" | "desc"

/** Options for {@link createSearchableList}. */
export interface SearchableListOptions {
	/**
	 * The container element. Must CONTAIN (not be) an element with class
	 * `js-list`, plus optionally a `js-search` input and `js-sort` buttons —
	 * List.js resolves all three by descendant class lookup at construction.
	 */
	root: HTMLElement
	/**
	 * The `data-*` attribute names to index, without the `data-` prefix. Every
	 * item node must carry all of them for search and sort to behave.
	 */
	keys: string[]
	/**
	 * Notified after every List.js update with how many items match the current
	 * search and how many exist in total, so callers can render an empty state
	 * without knowing about List.js.
	 */
	onUpdate?: (matching: number, total: number) => void
}

/** Controller returned by {@link createSearchableList}. */
export interface SearchableList {
	/**
	 * Re-index after the caller has rebuilt the item nodes, re-applying the
	 * current search term and sort. Call this at the end of every render.
	 */
	sync(): void
	/** Sort by one of `keys`; re-applied automatically on the next {@link sync}. */
	sortBy(key: string, order: SortOrder): void
	/** Release this adapter's listeners. The caller still owns removing the DOM. */
	destroy(): void
}

/** Remembered sort, re-applied after each re-index. */
interface ActiveSort {
	key: string
	order: SortOrder
}

/**
 * Attach List.js to a container whose item nodes somebody else renders.
 *
 * @param options - Container, index keys, and the match-count callback
 */
export function createSearchableList(options: SearchableListOptions): SearchableList {
	const { root, keys, onUpdate } = options

	const list = new List(root, {
		valueNames: [{ data: keys }],
		item: PLACEHOLDER_ITEM,
		listClass: LIST_CLASS,
		searchClass: SEARCH_CLASS,
		sortClass: SORT_CLASS,
	})

	const searchInput = root.querySelector<HTMLInputElement>(`.${SEARCH_CLASS}`)
	let activeSort: ActiveSort | null = null
	let disposed = false

	// List.js binds the search field on `keyup`, and on `input` only to catch the
	// native clear button (it early-returns unless the value is empty). That
	// misses every way of changing an input that is not a keystroke: paste with
	// the mouse or a context menu, autofill, drag-and-drop, speech input. Binding
	// `input` ourselves covers all of them. Typing now searches twice, which is
	// harmless — `searchMethod()` resets and recomputes from scratch each call.
	const handleInput = () => {
		if (disposed) return
		list.search(searchInput?.value ?? "")
	}
	searchInput?.addEventListener("input", handleInput)

	// Gated on `disposed` rather than unsubscribed: List.js's `off()` is absent
	// from its published type definitions, and a dead-flag check is both simpler
	// and immune to the handler being re-entered mid-teardown.
	list.on("updated", () => {
		if (disposed) return
		onUpdate?.(list.matchingItems.length, list.items.length)
	})

	// `sort.js` binds its own click handler to every `.js-sort` element, but it
	// only records direction in CSS classes. Mirroring the click here keeps
	// `activeSort` in step so `sync()` can restore the order after a re-index.
	const sortButtons = Array.from(root.querySelectorAll<HTMLElement>(`.${SORT_CLASS}`))
	const sortClickHandlers = sortButtons.map((button) => {
		const handler = () => {
			const key = button.dataset.sort
			if (!key) return
			// List.js has already flipped the direction and stamped the class by the
			// time this runs, so read the result rather than re-deriving it.
			activeSort = { key, order: button.classList.contains("desc") ? "desc" : "asc" }
		}
		button.addEventListener("click", handler)
		return { button, handler }
	})

	return {
		sync() {
			list.reIndex()

			// `reIndex()` re-parses in DOM order and resets `searched`/`filtered`
			// without calling `update()`, so both pieces of state have to be put back.
			if (activeSort) {
				list.sort(activeSort.key, { order: activeSort.order })
			}
			// `search("")` resets the filter and updates, so this covers both the
			// filtered and unfiltered cases without a branch.
			list.search(searchInput?.value ?? "")
		},

		sortBy(key, order) {
			activeSort = { key, order }
			list.sort(key, { order })
		},

		destroy() {
			disposed = true
			searchInput?.removeEventListener("input", handleInput)
			for (const { button, handler } of sortClickHandlers) {
				button.removeEventListener("click", handler)
			}
			// List.js exposes no teardown of its own. Its remaining listeners sit on
			// nodes inside the subtree the caller removes, so they go with it.
		},
	}
}
