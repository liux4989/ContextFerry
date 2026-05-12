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

The server API runs at `http://localhost:8787` by default. The extension endpoint only controls where extracted content is sent. The returned publish link is controlled by the server publish mode: use Google Drive or GitHub Pages when the link must be shareable outside your tailnet.

Optional network settings:

```bash
HOST=tailscale PUBLIC_HOST=tailscale npm run dev:server
```

For the common Tailscale + Google Drive setup, use:

```bash
pnpm run dev:server:tailscale:gDrive
```

For Tailscale + GitHub Pages publishing, use:

```bash
pnpm run dev:server:tailscale:pages
```

- `HOST`: listen address. Use `tailscale`, `localhost`, `0.0.0.0`, or a concrete IP.
- `PUBLIC_HOST`: generated link host for `local` publish mode only. Use `tailscale`, `localhost`, or a concrete IP.
- `PUBLIC_BASE_URL`: full local-mode URL override.

The extension popup has one server endpoint field:

- `localhost`: posts to `http://localhost:8787`.
- `cr7rog` or `100.x.x.x`: posts to that Tailscale host and adds port `8787` when omitted.
- `https://host`: posts to the full remote URL as provided.

This field does not decide the returned public link. Start the server with `dev:server:tailscale:gDrive` or `dev:server:tailscale:pages` when you want the response URL to be a Google Drive or GitHub Pages link.

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

Set `gDrive: true` in the JSON body, or call `POST /api/contexts?gDrive=true`, to publish that request to Google Drive instead of the configured default publisher.

## GitHub Pages Publishing

The extension still posts extracted content to the local server. The server can then publish the generated static artifact to a GitHub Pages repo and return the Pages link.

```bash
PUBLISH_MODE=github-pages \
GITHUB_PAGES_BASE_URL=https://USER.github.io/REPO \
PUBLISH_REPO_DIR=/path/to/pages/repo \
npm run dev:server
```

For this repo, use:

```bash
npm run dev:server:pages
```

Optional settings:

- `PUBLISH_CONTEXT_DIR`: output folder inside the repo, default `contexts`.
- `PUBLISH_GIT_REMOTE`: git remote to push, default `origin`.
- `PUBLISH_COMMIT_PREFIX`: commit message prefix, default `Publish context`.

In `github-pages` mode, `POST /api/contexts` writes:

```text
contexts/:id/index.html
contexts/:id/context.md
```

Then it runs `git add`, `git commit`, and `git push`, and returns:

```json
{ "url": "https://USER.github.io/REPO/contexts/:id/index.html" }
```

GitHub Pages may take a short moment to serve the new file after push succeeds.

## Google Drive Publishing

The extension still posts extracted content to the local server. The server can also upload the generated Markdown context to Google Drive and return the Drive file link. Google Drive is available either as the server default or as a per-request alternative to GitHub Pages with `gDrive: true`.

```bash
PUBLISH_MODE=google-drive \
GOOGLE_APPLICATION_CREDENTIALS=/path/to/application-default-credentials.json \
npm run dev:server
```

For this repo, use:

```bash
npm run dev:server:gDrive
```

That script loads `.env.google-drive`, which should point `GOOGLE_APPLICATION_CREDENTIALS` at the local OAuth Application Default Credentials JSON.

`GOOGLE_APPLICATION_CREDENTIALS` can point at an Application Default Credentials JSON file generated from an OAuth desktop client. This is the preferred local setup when service account key creation is disabled by organisation policy.

By default, Drive publishing looks for a folder named `LLMRecordings`. You can override the folder lookup with either:

```bash
GOOGLE_DRIVE_FOLDER_NAME=AnotherFolder
GOOGLE_DRIVE_FOLDER_ID=your-drive-folder-id
```

In `google-drive` mode, `POST /api/contexts` uploads:

```text
:id.md
```

The uploaded file is the final agent-friendly Markdown artifact. The server grants `anyone` reader access to the uploaded file and returns the Google Drive Markdown file link:

```json
{ "url": "https://drive.google.com/file/d/FILE_ID/view?usp=drivesdk" }
```

If you use a service account, share the target Drive folder with the service account email before publishing. If you use OAuth user credentials, the authenticated user needs access to the folder.
