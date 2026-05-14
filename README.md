# Context Ferry

## Commands

```bash
pnpm install
pnpm run build
pnpm run deploy:worker
pnpm run typecheck
```

## Cloudflare Worker

Context Ferry is deployed as one Cloudflare Worker backed by one Workers KV namespace:

- Worker package: `packages/worker`
- Worker config: `packages/worker/wrangler.jsonc`
- Worker URL: `https://contextferry.liux4989.workers.dev`
- KV binding name used by code: `CONTEXTS`
- Public API endpoint: `POST /api/contexts`
- Public render endpoint: `GET /c/:id`
- Raw Markdown endpoint: `GET /api/contexts/:id`

Deploy after the `CONTEXTS` KV namespace is bound in `packages/worker/wrangler.jsonc`:

```bash
pnpm run deploy:worker
```

If you attach a custom domain, set `PUBLIC_BASE_URL` in `packages/worker/wrangler.jsonc` so created context links use that domain. Without it, the Worker returns links from the request origin, which is correct for the default `workers.dev` URL.

## Extension

Build output:

```text
packages/extension/dist
```

Load unpacked in Chrome:

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click `Load unpacked`
4. Select `packages/extension/dist`

## Notes

- `pnpm run build` builds shared, worker, and extension locally.
- `pnpm run deploy:worker` deploys the Worker to Cloudflare.
- The extension publishes directly to `https://contextferry.liux4989.workers.dev`.
