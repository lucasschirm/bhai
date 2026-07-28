// @vitest-environment happy-dom
//
// `list.js` reads `window` at module-evaluation time (src/utils/events.js line
// 1), so any test that imports the adapter — directly or transitively — needs a
// DOM environment or it throws on import under the repo's default `node` one.

import { beforeEach, describe, expect, it } from "vitest"
import { createSearchableList } from "./searchable-list.js"

/**
 * Build the container shape List.js expects: a root holding a `.js-search`
 * input, `.js-sort` buttons, and the `.js-list` element itself.
 */
function fixture(): { root: HTMLElement; list: HTMLElement; search: HTMLInputElement } {
	document.body.innerHTML = `
		<div id="root">
			<input class="js-search" type="search" />
			<button class="js-sort" type="button" data-sort="name">name</button>
			<button class="js-sort" type="button" data-sort="status">status</button>
			<ul class="js-list"></ul>
			<p id="outside">not an item</p>
		</div>
	`
	const root = document.getElementById("root") as HTMLElement
	return {
		root,
		list: root.querySelector(".js-list") as HTMLElement,
		search: root.querySelector(".js-search") as HTMLInputElement,
	}
}

/** Append an item node carrying the indexed `data-*` attributes. */
function addItem(list: HTMLElement, name: string, status: string): void {
	const item = document.createElement("li")
	item.dataset.name = name
	item.dataset.status = status
	item.textContent = name
	list.appendChild(item)
}

/** The `data-name` values currently rendered, in DOM order. */
function visibleNames(list: HTMLElement): string[] {
	return Array.from(list.children).map((node) => (node as HTMLElement).dataset.name ?? "")
}

describe("createSearchableList", () => {
	beforeEach(() => {
		document.body.innerHTML = ""
	})

	it("constructs over an empty list without throwing", () => {
		// List.js throws "The list needs to have at least one item on init" unless
		// an `item` template is supplied. The panel starts empty on every page
		// load, so this is the common case, not an edge case.
		const { root } = fixture()
		expect(() => createSearchableList({ root, keys: ["name", "status"] })).not.toThrow()
	})

	it("indexes items added after construction, once synced", () => {
		const { root, list } = fixture()
		const searchable = createSearchableList({ root, keys: ["name", "status"] })

		addItem(list, "alpha", "connected")
		addItem(list, "beta", "error")
		searchable.sync()

		expect(visibleNames(list)).toEqual(["alpha", "beta"])
	})

	it("filters items when the search input is typed into", () => {
		const { root, list, search } = fixture()
		const searchable = createSearchableList({ root, keys: ["name", "status"] })

		addItem(list, "alpha", "connected")
		addItem(list, "beta", "error")
		searchable.sync()

		search.value = "alph"
		search.dispatchEvent(new Event("keyup"))

		expect(visibleNames(list)).toEqual(["alpha"])
	})

	it("filters on `input` too, not only on `keyup`", () => {
		// List.js binds the search field on `keyup`, and on `input` only to catch
		// the native clear button. Everything that changes an input without a
		// keystroke — paste, autofill, drag-and-drop, speech — fires `input`
		// alone, and used to leave the list unfiltered.
		const { root, list, search } = fixture()
		const searchable = createSearchableList({ root, keys: ["name", "status"] })

		addItem(list, "alpha", "connected")
		addItem(list, "beta", "error")
		searchable.sync()

		search.value = "alph"
		search.dispatchEvent(new Event("input"))

		expect(visibleNames(list)).toEqual(["alpha"])
	})

	it("restores every item when the search field is cleared", () => {
		const { root, list, search } = fixture()
		const searchable = createSearchableList({ root, keys: ["name", "status"] })

		addItem(list, "alpha", "connected")
		addItem(list, "beta", "error")
		searchable.sync()

		search.value = "alph"
		search.dispatchEvent(new Event("input"))
		expect(visibleNames(list)).toEqual(["alpha"])

		search.value = ""
		search.dispatchEvent(new Event("input"))
		expect(visibleNames(list)).toEqual(["alpha", "beta"])
	})

	it("searches across every indexed key, not just the visible name", () => {
		const { root, list, search } = fixture()
		const searchable = createSearchableList({ root, keys: ["name", "status"] })

		addItem(list, "alpha", "connected")
		addItem(list, "beta", "error")
		searchable.sync()

		search.value = "error"
		search.dispatchEvent(new Event("keyup"))

		expect(visibleNames(list)).toEqual(["beta"])
	})

	it("keeps the search term applied across a re-render", () => {
		// The MCP panel re-renders the whole list on every manager transition, so
		// a filter that silently resets on an unrelated server's state change
		// would be worse than no filter at all.
		const { root, list, search } = fixture()
		const searchable = createSearchableList({ root, keys: ["name", "status"] })

		addItem(list, "alpha", "connected")
		addItem(list, "beta", "error")
		searchable.sync()

		search.value = "alph"
		search.dispatchEvent(new Event("keyup"))
		expect(visibleNames(list)).toEqual(["alpha"])

		// Re-render: rebuild the nodes from scratch, as the component does.
		list.replaceChildren()
		addItem(list, "alpha", "connected")
		addItem(list, "beta", "error")
		addItem(list, "alphabet", "connecting")
		searchable.sync()

		expect(visibleNames(list)).toEqual(["alpha", "alphabet"])
	})

	it("re-applies the active sort after a re-render", () => {
		const { root, list } = fixture()
		const searchable = createSearchableList({ root, keys: ["name", "status"] })

		addItem(list, "beta", "error")
		addItem(list, "alpha", "connected")
		searchable.sync()
		searchable.sortBy("name", "desc")
		expect(visibleNames(list)).toEqual(["beta", "alpha"])

		list.replaceChildren()
		addItem(list, "alpha", "connected")
		addItem(list, "beta", "error")
		addItem(list, "gamma", "connecting")
		searchable.sync()

		expect(visibleNames(list)).toEqual(["gamma", "beta", "alpha"])
	})

	it("sorts when a .js-sort button is clicked, and flips direction on re-click", () => {
		const { root, list } = fixture()
		const searchable = createSearchableList({ root, keys: ["name", "status"] })

		addItem(list, "beta", "error")
		addItem(list, "alpha", "connected")
		searchable.sync()

		const nameButton = root.querySelector<HTMLElement>('[data-sort="name"]') as HTMLElement
		nameButton.click()
		expect(visibleNames(list)).toEqual(["alpha", "beta"])

		nameButton.click()
		expect(visibleNames(list)).toEqual(["beta", "alpha"])

		// The direction the button ended on must survive the next re-render too.
		list.replaceChildren()
		addItem(list, "alpha", "connected")
		addItem(list, "beta", "error")
		searchable.sync()
		expect(visibleNames(list)).toEqual(["beta", "alpha"])
	})

	it("reports match counts through onUpdate", () => {
		const { root, list, search } = fixture()
		const seen: Array<[number, number]> = []
		const searchable = createSearchableList({
			root,
			keys: ["name", "status"],
			onUpdate: (matching, total) => seen.push([matching, total]),
		})

		addItem(list, "alpha", "connected")
		addItem(list, "beta", "error")
		searchable.sync()
		expect(seen.at(-1)).toEqual([2, 2])

		search.value = "alph"
		search.dispatchEvent(new Event("keyup"))
		expect(seen.at(-1)).toEqual([1, 2])

		search.value = "nothing-matches-this"
		search.dispatchEvent(new Event("keyup"))
		expect(seen.at(-1)).toEqual([0, 2])
	})

	it("leaves nodes outside the .js-list element alone", () => {
		// List.js's `update()` clears every child of `.js-list` before re-appending
		// the matching items, which is why empty-state nodes have to be siblings.
		const { root, list } = fixture()
		const searchable = createSearchableList({ root, keys: ["name", "status"] })

		addItem(list, "alpha", "connected")
		searchable.sync()

		expect(root.querySelector("#outside")).not.toBeNull()
	})

	it("stops reporting updates after destroy()", () => {
		const { root, list, search } = fixture()
		let calls = 0
		const searchable = createSearchableList({
			root,
			keys: ["name", "status"],
			onUpdate: () => {
				calls++
			},
		})

		addItem(list, "alpha", "connected")
		searchable.sync()
		const before = calls

		searchable.destroy()
		search.value = "alph"
		search.dispatchEvent(new Event("input"))

		expect(calls).toBe(before)
		// The adapter's own `input` binding is gone, so the list is untouched.
		expect(visibleNames(list)).toEqual(["alpha"])
	})
})
