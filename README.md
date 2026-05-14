# Context Ferry

## Commands

```bash
pnpm install
pnpm run build
pnpm run dev:worker
pnpm run deploy:worker
pnpm run typecheck
```

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

Worker URL input:

```text
https://context-ferry-worker.<subdomain>.workers.dev
```

## Notes

- `pnpm run build` builds shared, worker, and extension locally.
- `pnpm run dev:worker` runs the Worker locally with Wrangler.
- `pnpm run deploy:worker` deploys the Worker to Cloudflare.
- The extension publishes to the Worker base URL you enter in the popup.
