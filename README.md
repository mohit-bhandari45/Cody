# AI PR Review Bot

An AI-powered GitHub App that automatically reviews pull requests. When a PR is opened or updated, the bot fetches the diff, sends it to an LLM for analysis, and posts a structured review comment back on the PR — summary, potential bugs, and style/logic concerns — without a human reviewer lifting a finger first.

---

## Table of Contents

- [Why this exists](#why-this-exists)
- [High-level architecture](#high-level-architecture)
- [End-to-end request flow](#end-to-end-request-flow)
- [Component breakdown](#component-breakdown)
- [Tech stack](#tech-stack)
- [Data flow: sequence diagram](#data-flow-sequence-diagram)
- [Job lifecycle (BullMQ)](#job-lifecycle-bullmq)
- [Project structure](#project-structure)
- [Setup](#setup)
- [Build phases / roadmap](#build-phases--roadmap)

---

## Why this exists

Human code review is slow and inconsistent — obvious bugs, unclear naming, or style issues often slip through simply because reviewers are busy or the diff is large. This bot acts as an automated first pass: it never sleeps, never skips a file because it's tired, and gives a consistent baseline review within seconds of a PR being opened.

---

## High-level architecture

```mermaid
flowchart LR
    A[Developer] -->|opens/updates PR| B[GitHub]
    B -->|webhook event| C[Webhook Receiver<br/>Express Server]
    C -->|verified job| D[(Redis<br/>BullMQ Queue)]
    D --> E[Worker Process]
    E -->|fetch diff| B
    E -->|analyze| F[LLM API]
    F -->|structured feedback| E
    E -->|post comment| B
    E -->|live status| G[Socket.IO Dashboard]
    B -->|comment appears| A
```

**Reading this diagram:** the developer never talks to your bot directly — everything routes through GitHub. Your server only reacts to GitHub events and writes back to GitHub via its API. The dashboard is a side-channel purely for visibility; it's not required for the bot to function.

---

## End-to-end request flow

```mermaid
flowchart TD
    Start([PR opened or\nnew commits pushed]) --> WH[GitHub sends webhook\nto /webhook endpoint]
    WH --> Verify{Signature\nvalid?}
    Verify -- No --> Reject[Reject request\n401 Unauthorized]
    Verify -- Yes --> Ack[Respond 200 OK\nimmediately]
    Ack --> Enqueue[Enqueue job in BullMQ]
    Enqueue --> Pickup[Worker picks up job]
    Pickup --> Fetch[Fetch PR diff\nvia GitHub API]
    Fetch --> Size{Diff too\nlarge?}
    Size -- Yes --> Chunk[Split by file /\nfilter noise]
    Size -- No --> Prompt[Build LLM prompt]
    Chunk --> Prompt
    Prompt --> LLM[Call LLM API]
    LLM --> Parse[Parse structured\nresponse]
    Parse --> Comment[Post comment\nback on PR]
    Comment --> Emit[Emit status to\nSocket.IO dashboard]
    Emit --> Done([Done])
```

---

## Component breakdown

| Component | Responsibility | Why it exists |
|---|---|---|
| **Webhook Receiver** | Express endpoint that receives GitHub events | Entry point — nothing happens until GitHub calls this |
| **Signature Verifier** | HMAC-SHA256 check on every incoming request | Prevents forged requests from triggering the bot |
| **Diff Fetcher** | Calls GitHub's API to get changed code | The webhook only announces *that* something changed, not *what* |
| **Diff Chunker** | Filters/splits large diffs | LLMs have context limits; huge diffs also produce vague feedback |
| **LLM Client** | Sends diff + prompt, parses response | The actual "AI" in the project — generates the review content |
| **Job Queue (BullMQ + Redis)** | Buffers work between webhook and processing | GitHub expects a fast response; LLM calls are slow — decouples the two |
| **Worker** | Background process consuming the queue | Does the actual slow work without blocking the webhook endpoint |
| **Comment Poster** | Posts formatted feedback back to the PR | Closes the loop — this is what the developer actually sees |
| **Socket.IO Dashboard** | Live view of job status | Demo/portfolio value — turns an invisible script into a visible product |

---

## Tech stack

```mermaid
mindmap
  root((PR Review Bot))
    Backend
      Node.js
      TypeScript
      Express
    Queue
      BullMQ
      Redis / Upstash
    AI
      LLM API
      Prompt engineering
    Realtime
      Socket.IO
    Integration
      GitHub REST API
      GitHub Webhooks
      GitHub App auth
    Deployment
      Railway / Render
      Upstash Redis
```

---

## Data flow: sequence diagram

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant GH as GitHub
    participant Srv as Webhook Server
    participant Q as BullMQ Queue
    participant W as Worker
    participant LLM as LLM API
    participant Dash as Dashboard

    Dev->>GH: Opens PR
    GH->>Srv: POST /webhook (pull_request.opened)
    Srv->>Srv: Verify signature
    Srv-->>GH: 200 OK (immediate ack)
    Srv->>Q: Enqueue review job
    Q->>W: Deliver job
    W->>GH: GET PR diff
    GH-->>W: Diff content
    W->>LLM: Analyze diff (prompt + diff)
    LLM-->>W: Structured feedback (JSON)
    W->>GH: POST comment on PR
    W->>Dash: Emit job:complete
    GH-->>Dev: Comment visible on PR
```

---

## Job lifecycle (BullMQ)

```mermaid
stateDiagram-v2
    [*] --> Queued: Webhook enqueues job
    Queued --> Active: Worker picks up
    Active --> Fetching: Get diff from GitHub
    Fetching --> Analyzing: Send to LLM
    Analyzing --> Posting: Format + post comment
    Posting --> Completed: Comment posted
    Analyzing --> Failed: LLM error
    Fetching --> Failed: GitHub API error
    Failed --> Retrying: Retry policy triggers
    Retrying --> Active
    Failed --> DeadLetter: Max retries exceeded
    Completed --> [*]
    DeadLetter --> [*]
```

---

## Project structure

```
pr-bot/
├── src/
│   ├── server.ts            # Express app, webhook endpoint
│   ├── verifySignature.ts   # HMAC signature verification
│   ├── github/
│   │   ├── fetchDiff.ts     # Get PR diff via GitHub API
│   │   └── postComment.ts   # Post review comment back to PR
│   ├── llm/
│   │   ├── prompt.ts        # System prompt + formatting
│   │   └── client.ts        # LLM API call wrapper
│   ├── queue/
│   │   ├── queue.ts         # BullMQ queue definition
│   │   └── worker.ts        # Background worker process
│   └── dashboard/
│       └── socket.ts        # Socket.IO event emitters
├── .env                      # Secrets (not committed)
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# then edit .env with your GitHub webhook secret, LLM API key, Redis URL

# 3. Run in development
npm run dev

# 4. Expose local server for GitHub (dev only)
ngrok http 3000
```

---

## Build phases / roadmap

```mermaid
flowchart LR
    P1[Part 1\nWebhook Receiver] --> P2[Part 2\nFetch Diff]
    P2 --> P3[Part 3\nLLM Integration]
    P3 --> P4[Part 4\nPost Comment]
    P4 --> P5[Part 5\nBullMQ Queue]
    P5 --> P6[Part 6\nLarge Diff Handling]
    P6 --> P7[Part 7\nSocket.IO Dashboard]
    P7 --> P8[Part 8\nDeploy + Real Test]

    style P1 fill:#4a9,stroke:#333
```

**Status:** 🟢 Part 1 in progress — webhook receiver + signature verification.

| Phase | What it proves |
|---|---|
| 1. Webhook Receiver | GitHub can reach the server, and requests are verified as authentic |
| 2. Fetch Diff | Server can retrieve the actual code changes for a PR |
| 3. LLM Integration | The core AI value — diff in, structured review out |
| 4. Post Comment | The loop closes — feedback appears where developers actually look |
| 5. BullMQ Queue | The system stays reliable and responsive under load |
| 6. Large Diff Handling | The bot doesn't break or produce garbage on big PRs |
| 7. Socket.IO Dashboard | The project becomes demo-able as a visible product |
| 8. Deploy + Real Test | The bot runs live against real open-source PRs |