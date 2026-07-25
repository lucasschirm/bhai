#!/usr/bin/env sh
# SessionStart hook: make sure the TypeScript language server this plugin's
# .lsp.json points at actually exists, so Claude Code can spawn it.
#
# Claude Code starts the server itself (lazily, the first time a TS/JS file is
# touched) from `.claude/plugins/typescript-lsp/.lsp.json`. All this hook has to
# guarantee is that `node_modules/.bin/typescript-language-server` and the
# matching `typescript` are on disk — on a fresh clone they are not.

set -eu

project_dir="${CLAUDE_PROJECT_DIR:-}"
if [ -z "$project_dir" ]; then
	project_dir="$(CDPATH='' cd -- "$(dirname -- "$0")/../../../.." && pwd)"
fi
cd "$project_dir"

lsp_bin="node_modules/.bin/typescript-language-server"
tsserver="node_modules/typescript/lib/tsserver.js"

emit() {
	printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$1"
}

# Already installed: nothing to do, stay silent.
if [ -x "$lsp_bin" ] && [ -f "$tsserver" ]; then
	exit 0
fi

install_deps() {
	if command -v pnpm >/dev/null 2>&1; then
		pnpm install --frozen-lockfile || pnpm install
	elif command -v corepack >/dev/null 2>&1; then
		corepack pnpm install --frozen-lockfile || corepack pnpm install
	elif command -v npx >/dev/null 2>&1; then
		npx --yes pnpm@9.15.0 install --frozen-lockfile || npx --yes pnpm@9.15.0 install
	else
		return 127
	fi
}

install_log="$(install_deps 2>&1)" || {
	emit "TypeScript LSP unavailable: dependency install failed. Run 'pnpm install' manually. Last output: $(printf '%s' "$install_log" | tail -n 3 | tr -d '\"' | tr '\n' ' ')"
	exit 0
}

if [ ! -x "$lsp_bin" ] || [ ! -f "$tsserver" ]; then
	emit "TypeScript LSP unavailable: 'typescript-language-server' is missing from node_modules after install. Check the devDependencies in package.json."
	exit 0
fi

# Smoke-test the binary so a broken install surfaces here rather than as a
# silent LSP spawn failure later in the session.
if ! version="$("$lsp_bin" --version 2>&1)"; then
	emit "TypeScript LSP unavailable: 'typescript-language-server --version' failed. Check the Node.js version."
	exit 0
fi

emit "Installed project dependencies; typescript-language-server $version is ready. Claude Code will start it on the first TS/JS file it touches."
