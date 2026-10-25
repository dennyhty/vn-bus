# VN-BUS

Website for searching Vexere (Vietnam long-distance bus) trips. Frontend on GitHub
Pages, backend on a Cloudflare Worker. UI text is Chinese; operator, bus and station
names stay in English to match the Vexere app.

## Model routing (save usage)

Use the cheapest model that can do the job.

| Work | Model | How |
| --- | --- | --- |
| Find files, grep, read docs/pages, summarize | Haiku | `scout` subagent |
| Well-specified edits, small features, tests, docs | Sonnet | `builder` subagent, or run the session on Sonnet |
| Vexere API reverse-engineering, architecture, tricky debugging, reviewing a plan | Opus | main session |

- Default sessions to Sonnet (`/model sonnet`); switch to Opus only for the last row.
- Delegate to a subagent only when the task is self-contained; a subagent starts
  without context, so tiny tasks are cheaper to do inline.
- Keep context small: read file ranges instead of whole files, and avoid re-reading.
