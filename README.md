# Context Ferry

Chrome extension and local publishing server for turning inaccessible or fragmented web content into stable, agent-friendly context links.

## What It Does

- Extracts the current page with Mozilla Readability.
- Converts extracted content into a structured document plus Markdown context.
- Publishes one page or a batch of pages to the server.
- Returns one shareable context link whose durable payload is the generated agent-friendly Markdown.

## Quick Start

```bash
npm install
npm run build
npm run dev:server
```

Load the extension:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select `packages/extension/dist`.

The server runs at `http://localhost:8787` by default. The extension popup lets you change that endpoint.

## Workflow

- `Extract current page`: runs Readability on the active tab and previews the resulting agent context.
- `Add to batch`: stores the extracted page in the extension batch.
- `Publish current`: publishes the current page and returns one context link.
- `Publish batch`: publishes every batched page as one combined context link.

## Packages

- `packages/shared`: shared extraction input schema and Markdown serialization.
- `packages/server`: Express API and HTML context viewer. It stores one artifact per link: the agent-friendly Markdown context.
- `packages/extension`: Manifest V3 Chrome extension.

## Server Protocol

```http
POST /api/contexts
Content-Type: application/json

{
  "title": "Optional title",
  "sources": [{ "...": "extracted page document" }]
}
```

Response:

```json
{ "url": "http://localhost:8787/c/context-id" }
```

The public context page is `GET /c/:id`. The raw agent context is `GET /api/contexts/:id` as `text/markdown`.
