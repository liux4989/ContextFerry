# r/codex: What diagram/schema formats, Codex understands better?
Created: 2026-05-12T06:01:32.869Z
Sources: 1
## Source Index
1. r/codex: What diagram/schema formats, Codex understands better? (https://www.reddit.com/r/codex/comments/1ryuoi6/what_diagramschema_formats_codex_understands/)

## Source 1: r/codex: What diagram/schema formats, Codex understands better?
URL: https://www.reddit.com/r/codex/comments/1ryuoi6/what_diagramschema_formats_codex_understands/
Site: Reddit
Byline: u/jrhabana
Excerpt: when I'm planning, it is easier for me to contrast with schemas/diagram claude is better at writing ascii diagrams, but codex is terrible. what though in use image generation but...

# What diagram/schema formats, Codex understands better?

Subreddit: r/codex

Author: u/jrhabana

Score: 3

Comments: 4

Posted: 2026-03-20T12:17:27.639Z

## Post

when I'm planning, it is easier for me to contrast with schemas/diagram

claude is better at writing ascii diagrams, but codex is terrible.

what though in use image generation but it broke the terminal flow moving to open in another window and tool

what are you using in codex to write visuals?

## Visible Comments

### u/zhacgsn - 2 points - 2026-03-20T12:25:24.122Z

I just use excalidraw to draw graphs that I want to give codex, and when I ask it for diagrams I tell it to use mermaid.

[Permalink](https://www.reddit.com/r/codex/comments/1ryuoi6/comment/obh3kxv/)

### u/nonprofittechy - 2 points - 2026-03-20T12:48:14.992Z

It can generate Mermaid.js syntax, and there are preview tools for GitHub and I believe vs code also

[Permalink](https://www.reddit.com/r/codex/comments/1ryuoi6/comment/obh7gdo/)

### u/cornmacabre - 1 points - 2026-03-20T22:34:53.457Z

Mermaid all day baby: it's a really effective way to communicate system or user flows that's token efficient and conceptually readable to both humans and robots.

Ascii is understandable path because it looks nice natively in .md's -- but IMO a total trap: at an LLM token level, my intuition is that ascii patterns are terrible at encoding conceptual information. It's a visual trick made for pleasing human eyeballs.

Asking an LLM to generate ascii is in the same territory as asking it to generate an SVG. Sure they can kinda do it, but it's not reliable at all. It's kinda like asking a blind person to draw a picture of a horse.

[Permalink](https://www.reddit.com/r/codex/comments/1ryuoi6/comment/obkk0qv/)

### u/jrhabana - 1 points - 2026-03-22T13:15:10.529Z

To future visitors, I found a imagegen skill into the curated skills folder that solves part of this

[Permalink](https://www.reddit.com/r/codex/comments/1ryuoi6/comment/obtzo7z/)