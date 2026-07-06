# Credential resolution chain

> Source: `src/core/credentials.ts`
> Task: TASK_0021
> Architecture: § 10.4

## Overview

`resolveCredentials` is a kernel-level function that drivers and the MCP
client consult before any authenticated call, following a strict three-tier
priority chain so that BHAI never reads secrets from files/env itself and
never persists credentials beyond a single resolution call.

This keeps the kernel environment-agnostic (no filesystem/env access) while
still letting hosts wire arbitrary secret stores (PEP's
`int_authentications` table, a CLI's `auth.json`, a browser app's token
endpoint).

## Three-tier priority chain

| Tier | Source | Behavior |
|---|---|---|
| 1 | Runtime value | If `runtimeValue` is defined, return it immediately. No `auth` hooks consulted. |
| 2 | Registered `auth` hooks | Iterate in plugin-registration order (sequential, not `Promise.all`). First defined result wins. |
| 3 | Unauthenticated | Return `undefined`. **Not an error** — correct for local Ollama/WebLLM. |

## API

### `resolveCredentials`

```typescript
async function resolveCredentials(
  scope: CredentialScope,
  runtimeValue?: Credentials,
  authHooks?: ReadonlyArray<CredentialResolver>,
): Promise<Credentials | undefined>
```

- **`scope`**: `{ kind: 'driver' | 'mcp'; id: string }` — the driver id or
  MCP server id this resolution applies to.
- **`runtimeValue`**: Tier-1 value supplied directly at the call site (e.g.
  `new Ollama({ headers })`'s `headers`). The caller is responsible for
  passing its own already-known runtime value in.
- **`authHooks`**: Tier-2 registered `auth` hooks in plugin-registration
  order. The caller (typically the `BHAI` kernel via `bh.getAuthHooks()`)
  supplies this list.

### `Credentials`

```typescript
type Credentials = Record<string, string>
```

Deliberately unopinionated — a bearer token might be
`{ Authorization: 'Bearer ...' }`, an API key `{ 'x-api-key': '...' }`. This
task does not model OAuth flows, token refresh, or expiry; per § 10.4,
"persistence and refresh (OAuth etc.) live behind the resolver."

### `CredentialResolver`

```typescript
interface CredentialResolver {
  resolve(scope: CredentialScope): Promise<Credentials | undefined>
}
```

A plugin capability hook (§ 7.2 `auth` key) registered via
`bh.use({ auth: { resolve } })`. Returning `undefined` means "this hook has
no credentials for this scope" — the chain falls through.

### `CredentialScope`

```typescript
interface CredentialScope {
  kind: "driver" | "mcp"
  id: string
}
```

## No caching

`resolveCredentials` caches nothing across calls — every invocation re-runs
the full chain from scratch. This is the mechanism by which "the kernel
never stores or caches secrets beyond the resolver's own lifetime" (§ 10.4)
is satisfied: there is no kernel-side cache to invalidate because there is
no cache at all.

Any caching/refresh behavior (e.g. an OAuth token cached for its lifetime)
is entirely the concern of the specific `CredentialResolver` implementation
a host supplies.

## Kernel integration

The `BHAI` class exposes `bh.getAuthHooks()` which returns all registered
`auth` capability hooks in plugin-registration order. Drivers and the MCP
client call:

```typescript
const creds = await resolveCredentials(
  { kind: "driver", id: "ollama" },
  runtimeHeaders,
  bh.getAuthHooks(),
)
```

## Plugin registration

Plugins register an `auth` hook via the capability-object form (§ 7.2):

```typescript
bh.use({
  name: "my-auth",
  auth: {
    resolve: async (scope) => {
      // Return credentials from your secret store, or undefined
      // if this hook doesn't handle this scope.
      return { Authorization: `Bearer ${getToken(scope.id)}` }
    },
  },
})
```

Multiple `auth` hooks can be registered; they're consulted in
`bh.use()` registration order.
