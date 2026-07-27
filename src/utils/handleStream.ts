import type EventEmitter from "events";
import type { StreamEvent } from "@langchain/core/tracers/log_stream";

/**
 * Shared streaming bridge for every Group A / writing-assistant agent.
 *
 * Walks the output of a LangChain `.streamEvents()` iterator and re-emits:
 *   - "data" JSON { type: "sources", data: Document[] } when the reranker
 *     sub-chain (tagged "FinalSourceRetriever") finishes
 *   - "data" JSON { type: "response", data: <chunk> } for every streamed
 *     token from the answering chain (tagged "FinalResponseGenerator")
 *   - "end" when the answering chain completes
 *
 * Extracted per assignment section 0.1 — imported by every streaming agent
 * instead of being copy-pasted.
 */
const handleStream = async (
  stream: AsyncGenerator<StreamEvent, unknown, unknown>,
  emitter: EventEmitter,
) => {
  for await (const event of stream) {
    if (
      event.event === "on_chain_end" &&
      event.name === "FinalSourceRetriever"
    ) {
      emitter.emit(
        "data",
        JSON.stringify({ type: "sources", data: event.data.output }),
      );
    }
    if (
      event.event === "on_chain_stream" &&
      event.name === "FinalResponseGenerator"
    ) {
      emitter.emit(
        "data",
        JSON.stringify({ type: "response", data: event.data.chunk }),
      );
    }
    if (
      event.event === "on_chain_end" &&
      event.name === "FinalResponseGenerator"
    ) {
      emitter.emit("end");
    }
  }
};

export default handleStream;
