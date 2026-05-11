# More code, faster reviews: how we rebuilt code review at Augment using Cosmos
Created: 2026-05-11T15:46:23.321Z
Sources: 1
## Source Index
1. More code, faster reviews: how we rebuilt code review at Augment using Cosmos (https://www.augmentcode.com/blog/solving-code-review-with-cosmos)

## Source 1: More code, faster reviews: how we rebuilt code review at Augment using Cosmos
URL: https://www.augmentcode.com/blog/solving-code-review-with-cosmos
Site: Augment Code
Byline: Akshay Utture, Will Colbert
Excerpt: The most powerful AI software development platform with the industry-leading context engine.

TL;DR. When agents write 100% of your code, the bottleneck moves to review: at one point we had 1,400 open PRs and a 20-hour median time-to-first-comment. We rebuilt the review process on [Cosmos](https://www.augmentcode.com/product/cosmos) as a team of agents that auto-approves low-risk changes, runs line-by-line correctness analysis, and pulls humans in only for the calls that need judgment. Since January, code output is up 3x, median merge time has dropped, and bug rate per output unit is trending down.

Teams that go all-in on AI coding tools hit the same wall. Raw code output grows exponentially, and PRs pile up in the review queue. Someone's whole job could be reviewing PRs and it would still make no dent. Some companies solve this by rubber stamping PRs to keep moving fast, but shipping faster with bugs and uncontrolled tech debt is a one-way road to chaos.

Here is how we solved our code review bottleneck and started merging PRs at the same rapid rate that we were generating them. We did this without compromising on the quality of the software nor our reviewers’ understanding of the PRs they reviewed. This was a fundamental rethink of how code reviews are done. Let's dig in.

We hit the code review wall at Augment in January. With 100% of our code being written by agents, PRs generated shot up, but so did the median merge time (i.e. PR latency). PR merge rate (i.e. PR throughput) went up, but not at the pace at which they were being generated. PRs started piling up in the review queue and there were over 1,400 open PRs at one point. We had a real problem.

Our median time-to-first-human-comment was hovering around 1,200 minutes. That's 20 hours before an engineer even looked at your PR. This wasn't a reviewer problem. They had six PRs ahead of yours, each 400 lines of code they didn't write. Our original AI code review tool ran in 3-5 minutes and caught real bugs, but a human still had to read every line of every PR. A two-line change ended up waiting a day at the bottom of the queue.

Our VP of Engineering called it out: [the main bottleneck was confidence](https://www.augmentcode.com/blog/confidence-is-the-new-bottleneck): a human reviewer needed to read and reason about every single line of code to gain confidence in the quality of what was being shipped, and develop an understanding of the system being built. This was what we had to solve.

A couple of months ago, Augment internally rolled out [Cosmos](https://www.augmentcode.com/blog/cosmos-now-in-public-preview), our operating system for agentic software development: agents that run anywhere, work across your SDLC, with humans steering where judgment matters. It is purpose built for automating workflows, with several out-of-the-box feature for teams like shared context and memory, self-improving agent loops, connections to all of your tools, etc. Each Cosmos automation comes in the form of an Expert, which has its own prompt, integrations, environment, secrets, event triggers, subscriptions, worker experts and much more. Code review was naturally the first automation we went after.

The figure below highlights our new code review process: a team of Experts drives the code review process and pulls in the human only when needed. It splits the code review process into four coordinated loops: change execution (PR Author), risk analysis (PR Risk Analyzer), correctness (Bug Reviewer), and system design judgment (Intent Reviewer + human), all continuously improving via shared memory.

![Flowchart of Augment's code review system. A PR Author submits a pull request to a PR Risk Analyzer at the top, which routes each PR down one of three paths: Auto-Approve for low-risk changes, Deep Code Review for line-by-line correctness analysis, or Intent Reviewer for architecture, security, tests, design, and product context. The Intent Reviewer exchanges findings and guidance with a Human reviewer who provides high-level judgment. All three paths converge at a Review Outcome step, which feeds a Code Review Memory layer. The Memory captures human feedback, distills it into per-repo knowledge, and shares it back with every expert on future PRs.](https://www.augmentcode.com/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Foraw2u2c%2Fproduction%2F19e0bc708e0b9cdb8f62de20359ad457092c3c30-1536x1024.png%3Fw%3D1600%26fm%3Dwebp%26q%3D90%26dpr%3D2&w=2160&q=75)

Augment's new code review process on Cosmos

### PR Risk Analyzer

Evaluates the risk for every new PR automatically and routes it appropriately.

-   **Low-risk changes** (docs, configs, trivial edits) → automatically approved with justification\*\*
-   **Higher-risk changes** → tagged with specific review dimensions (e.g. architecture, security) that need human input

\*\*_[talk to us](https://www.augmentcode.com/contact) to understand how to maintain SOC-II compliance with agent approved PRs._

### Intent Reviewer (Interactive)

Owns the review process end-to-end and engages the human only when needed.

-   Breaks the review into structured phases (design, risk, correctness, etc.)
-   Guides the human through decisions instead of requiring full code diff review
-   Posts finalized comments back to GitHub
-   This is the only part of the code review process requiring human input

### Deep Code Review

-   Performs deep, line-by-line correctness analysis focused purely on objective bugs
-   This is the component most similar to a standalone AI code review tool (Akshay wrote a separate post on [the engineering behind the review agent](https://www.augmentcode.com/blog/how-we-built-high-quality-ai-code-review-agent).)

### PR Author

Owns the execution loop of the PR lifecycle.

-   Given a feature request in a ticket or specification, it implements the feature and opens a PR
-   Automatically responds to review comments, fixes CI failures, resolves merge conflicts, and puts up subsequent commits
-   After providing a ticket link or specification, the human developer only needs to come in to give the final merge decision

### Memory Manager

Learns from every PR to continuously improve the system.

-   Captures human feedback from merged PRs - human comments, replies to bot comments, thumbs up/down emojis and sessions with the Intent Reviewer - and distills it into a structured, per-repo knowledge base that all experts ingest before starting their work
-   A deep-dive into the memory system will be discussed in an subsequent blog

Our [Weave charts](https://workweave.dev/) tell the story: while code output at Augment has gone up over 3x since January, median merge time has actually decreased.

![Line chart from November 6, 2025 to April 23, 2026 showing two weekly metrics. Code output rises from around 500 to a peak of 1,850, with most of the growth in the second half. Median PR merge time in minutes starts near 700, varies between 200 and 1,000 through January, then drops and holds around 250 to 350 from February onward.](https://cdn.sanity.io/images/oraw2u2c/production/92cc5e156be8cf1b2a4bb0ac8ac2387f2effa8c2-720x400.svg?w=1600&fm=webp&q=90&dpr=2)

Weekly code output more than tripled from November to April while median PR merge time fell by roughly two-thirds.

Bugs introduced have been steady over time even though we've been pushing significantly more code. The raw count didn't spike which many would expect. Bugs _per output unit_ is tapering down. Quality is maintained.

![Bar chart showing weekly bugs per output unit from January 5 to April 6, 2026. Values start near 0.05, peak at 0.097 in mid-January, then decline to 0.006 by the final week.](https://cdn.sanity.io/images/oraw2u2c/production/0990f72bd3746f6f79dd19c53464602b7ff860b5-720x400.svg?w=1600&fm=webp&q=90&dpr=2)

Bug-introducing commits per output unit dropped from a mid-January peak of 0.097 to 0.006 by April 6.

Weekly revert rate is healthy - we aim for it to be 1.5%, and we hover around +/- 0.5%.

![Line chart of weekly PR revert rate from October 15, 2025 to April 1, 2026, with a dashed horizontal reference line at 1.5. The line ranges between 0 and 2.5, with peaks of 2.5 in late November and 2.05 in mid-December. From late January onward, values stay below 1.](https://cdn.sanity.io/images/oraw2u2c/production/da1c2d69425aa6b960848369dd84d2e59b201d28-720x400.svg?w=1600&fm=webp&q=90&dpr=2)

The revert rate stayed below the 1.5 threshold in 20 of 25 weeks, with no exceptions after late January.

Finally there are two effects that we can’t capture in numbers; in spite of shorter review times:

-   Humans are still driving high-level system design because they have better organizational and business context.
-   Reviewers continue to get the knowledge transfer benefit of code review.

If AI has spiked the volume of code generated, the goal isn’t just “faster reviews.” It’s building a _review system_ that scales: automate low-level correctness, reserve humans for judgment calls, and eliminate low-risk queue work. You can do all of this using Augment’s Cosmos Platform, which is in [public preview](https://www.augmentcode.com/blog/cosmos-now-in-public-preview). Just prompt the platform’s Cosmos Advisor Expert saying “Set up the code review automation fleet for me” and it will build up this suite of code review experts for you and help you customize them to your unique requirements and setup.

After solving the code review bottleneck at Augment, we’ve moved on to automating our subsequent SDLC bottlenecks internally, including end-to-end testing, incident response, feedback triage, and ticket management, all deployed on the [Augment Cosmos Platform](https://www.augmentcode.com/product/cosmos). Stay tuned for upcoming blogs about those.