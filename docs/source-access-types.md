# Source Access Types

Context Ferry needs to distinguish between whether a link is open to humans and whether an agent can reliably extract the useful content from it.

## Type 1: Public and Agent-Readable

- Definition: no account is required, and the current extractor can reliably recover the real content.
- Example: a public Reddit post page that the dedicated Reddit extractor can read.
- Product meaning: this is the easiest case. The extension can capture the page directly without extra auth handling or provider-specific fallback logic.

## Type 2: Public but Not Yet Agent-Readable

- Definition: no account is required, but the current extraction path still fails to recover the useful content.
- Example: `chatgpt.com/share/...` pages when a generic fetch or generic Readability pass mostly sees app chrome instead of the actual conversation.
- Product meaning: this is not an auth problem. It is a provider/extraction problem. The fix is provider-specific extraction or browser-rendered extraction.

## Type 3: Auth-Required but Agent-Readable

- Definition: a human session must be logged in, but once the page is open in the browser, the extension can still extract the useful content from the live DOM.
- Example: signed-in conversation pages on `chatgpt.com/c/...` or `chatgpt.com/g/.../c/...`.
- Product meaning: the extension should support these pages directly because daily use usually happens on authenticated pages, not share links.

## Type 4: Auth-Required and Not Yet Agent-Readable

- Definition: both a logged-in session and new extraction work are needed.
- Product meaning: this is the highest-friction case and should be called out explicitly when prioritising providers.

## Current Design Rule

- `public` and `readable by agent` are different dimensions.
- Provider support should be decided by the real browser extraction path, not by whether a URL can be opened anonymously.
- For `chatgpt.com`, support should be host/provider based, not limited to `/share/...` links.
