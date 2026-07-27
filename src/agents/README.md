# Perplexity-Clone Agents — implementation notes

## Layout

```
src/
  agents/
    _searchAndAnswer.ts       # shared Group A factory (rerank + stream contract)
    academicSearchAgent.ts    # reference, kept as an inlined example
    imageSearchAgent.ts       # reference, Group B
    redditSearchAgent.ts      # built on _searchAndAnswer
    webSearchAgent.ts         # built on _searchAndAnswer (no engines override)
    youtubeSearchAgent.ts     # built on _searchAndAnswer
    videoSearchAgent.ts       # Group B, .invoke() only
    writingAssistantAgent.ts  # no search, streamed like Group A
    suggestionGeneratorAgent.ts
    index.ts                  # dispatchFocusMode(mode, ...)
  utils/
    formatHistory.ts
    computeSimilarity.ts      # cosine similarity
    handleStream.ts           # section 0.1 — shared, imported everywhere
  lib/
    searxng.ts                # requires SEARXNG_API_URL env var
    outputParsers/
      listLineOutputParser.ts # <suggestions> ... </suggestions> parser
```

## Section 1.3 audit — rerank sort direction

The reference `academicSearchAgent` sorts ascending
(`.sort((a, b) => a.similarity - b.similarity)`) and then slices the top 15.
Ascending sort puts the LEAST similar documents first, so slicing `.slice(0, 15)`
keeps the WORST matches — the opposite of what a reranker should do.

**Fix applied in this repo:** every Group A agent (via `_searchAndAnswer.ts`)
and the inlined `academicSearchAgent.ts` reference sorts DESCENDING
(`b.similarity - a.similarity`). The assignment asks not to silently patch the
given file — this file flags it explicitly instead, and applies the fix to
all four Group A agents consistently.

## suggestionGenerator — placement

Called from the same route handler, immediately AFTER the primary agent's
stream ends, using the updated `chat_history` (with the new assistant reply
appended). This avoids a second network round-trip from the frontend and
keeps chip generation server-owned. It is NOT wired through `handleStream` —
plain `.invoke()`, returns a `string[]` synchronously to the caller.

## Environment

Set once before running any agent:

- `SEARXNG_API_URL` — base URL of a reachable SearxNG instance.
- `OPENAI_API_KEY` — used by `ChatOpenAI` / `OpenAIEmbeddings` at the call site.

The agents themselves take `llm` and `embeddings` as parameters, so the
route handler owns provider construction.

## Manual test harness (per assignment section 5)

```ts
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { handleRedditSearch, handleVideoSearch, generateSuggestions } from "@/agents";

const llm = new ChatOpenAI({ model: "gpt-4o-mini", streaming: true });
const embeddings = new OpenAIEmbeddings({ model: "text-embedding-3-small" });

// Group A — streamed
const emitter = handleRedditSearch(
  "What do people think about the new iPhone?", [], llm, embeddings,
);
emitter.on("data", (d) => console.log(JSON.parse(d)));
emitter.on("end", () => console.log("done"));
emitter.on("error", (e) => console.error(e));

// Group B — list
console.log(await handleVideoSearch("black hole explained", [], llm));

// Suggestions — after primary stream finishes
console.log(await generateSuggestions({ chat_history: updatedHistory }, llm));
```

Recommended cases per Group A/B agent:
1. Normal question — sources + answer, or a result list.
2. Greeting "hi" — Group A: retriever emits `not_needed`, no docs. Group B:
   still runs (deliberate, per section 2.2 — neither image nor video has a
   `not_needed` branch in the reference project).
3. Follow-up referencing chat history — confirm the rephrase step folds the
   prior turn in.

## Dispatch

`dispatchFocusMode(mode, message, history, llm, embeddings)` routes to the
right agent. Streaming modes return an `EventEmitter`, list modes return
`Promise<unknown>`. Route handlers should branch on the return type when
wiring into Express/WebSocket.
