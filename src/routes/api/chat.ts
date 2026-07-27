import { createFileRoute } from "@tanstack/react-router";
import { ChatGroq } from "@langchain/groq";
import { OllamaEmbeddings } from "@langchain/ollama";
import {
  AIMessage,
  HumanMessage,
  type BaseMessage,
} from "@langchain/core/messages";

import {
  dispatchFocusMode,
  generateSuggestions,
  type FocusMode,
} from "../../agents";

interface ChatRequestMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequestBody {
  message: string;
  history?: ChatRequestMessage[];
  focusMode?: FocusMode;
}

const toLangchainHistory = (
  history: ChatRequestMessage[] = [],
): BaseMessage[] =>
  history.map((m) =>
    m.role === "user"
      ? new HumanMessage(m.content)
      : new AIMessage(m.content),
  );

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        console.log("🚀 Chat request received");

        const groqApiKey = process.env.GROQ_API_KEY;

        if (!groqApiKey) {
          return new Response(
            JSON.stringify({
              error: "GROQ_API_KEY is not configured on the server.",
            }),
            {
              status: 500,
              headers: {
                "content-type": "application/json",
              },
            },
          );
        }

        let body: ChatRequestBody;

        try {
          body = (await request.json()) as ChatRequestBody;
        } catch {
          return new Response(
            JSON.stringify({
              error: "Invalid JSON body",
            }),
            {
              status: 400,
              headers: {
                "content-type": "application/json",
              },
            },
          );
        }

        const focusMode = (body.focusMode ?? "web") as FocusMode;
        const message = (body.message ?? "").trim();

        console.log("📌 Focus mode:", focusMode);
        console.log("📌 Message:", message);

        if (!message) {
          return new Response(
            JSON.stringify({
              error: "message is required",
            }),
            {
              status: 400,
              headers: {
                "content-type": "application/json",
              },
            },
          );
        }

        const history = toLangchainHistory(body.history);

        console.log("🤖 Creating Groq LLM...");

        const llm = new ChatGroq({
          apiKey: groqApiKey,
          model: "llama-3.3-70b-versatile",
          temperature: 0.7,
          streaming: true,
        });

        let embeddings: OllamaEmbeddings | undefined;

        if (focusMode !== "writing") {
          console.log("🧠 Creating Ollama embeddings...");

          embeddings = new OllamaEmbeddings({
            model: "nomic-embed-text",
            baseUrl: "http://localhost:11434",
          });
        }

        const encoder = new TextEncoder();

        const send = (
          controller: ReadableStreamDefaultController<Uint8Array>,
          payload: unknown,
        ) => {
          controller.enqueue(
            encoder.encode(JSON.stringify(payload) + "\n"),
          );
        };

        /*
         * IMAGES AND VIDEOS
         */

        if (
          focusMode === "images" ||
          focusMode === "videos"
        ) {
          try {
            console.log(
              "🖼️🎥 Dispatching list mode:",
              focusMode,
            );

            const result = await dispatchFocusMode(
              focusMode,
              message,
              history,
              llm,
              embeddings,
            );

            return new Response(
              JSON.stringify({
                type: "list",
                data: result,
              }),
              {
                headers: {
                  "content-type": "application/json",
                },
              },
            );
          } catch (error) {
            console.error("❌ List mode error:", error);

            return new Response(
              JSON.stringify({
                error:
                  error instanceof Error
                    ? error.message
                    : String(error),
              }),
              {
                status: 500,
                headers: {
                  "content-type": "application/json",
                },
              },
            );
          }
        }

        /*
         * STREAMING MODES
         */

        console.log(
          "🔍 Dispatching streaming focus mode:",
          focusMode,
        );

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            let fullAnswer = "";

            try {
              const emitter = dispatchFocusMode(
                focusMode,
                message,
                history,
                llm,
                embeddings,
              ) as import("events").EventEmitter;

              console.log("✅ Agent dispatched");

              await new Promise<void>((resolve, reject) => {
                emitter.on(
                  "data",
                  (chunk: string) => {
                    console.log("📦 Received chunk:", chunk);

                    try {
                      const parsed = JSON.parse(chunk) as {
                        type: string;
                        data: unknown;
                      };

                      if (parsed.type === "response") {
                        fullAnswer += String(
                          parsed.data ?? "",
                        );
                      }

                      send(controller, parsed);
                    } catch (error) {
                      console.error(
                        "⚠️ Failed to parse chunk:",
                        error,
                      );
                    }
                  },
                );

                emitter.on("end", () => {
                  console.log("✅ Stream ended");
                  resolve();
                });

                emitter.on("error", (error: unknown) => {
                  console.error(
                    "❌ Agent emitter error:",
                    error,
                  );

                  send(controller, {
                    type: "error",
                    data:
                      error instanceof Error
                        ? error.message
                        : String(error),
                  });

                  reject(error);
                });
              });

              console.log("💡 Generating suggestions...");

              try {
                const updatedHistory: BaseMessage[] = [
                  ...history,
                  new HumanMessage(message),
                  new AIMessage(fullAnswer),
                ];

                const suggestions =
                  await generateSuggestions(
                    {
                      chat_history: updatedHistory,
                    },
                    llm,
                  );

                send(controller, {
                  type: "suggestions",
                  data: suggestions,
                });
              } catch (error) {
                console.error(
                  "⚠️ Suggestions failed:",
                  error,
                );
              }

              send(controller, {
                type: "done",
              });

              console.log("🏁 Request completed");
            } catch (error) {
              console.error(
                "❌ Request failed:",
                error,
              );

              send(controller, {
                type: "error",
                data:
                  error instanceof Error
                    ? error.message
                    : String(error),
              });
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "content-type":
              "application/x-ndjson; charset=utf-8",
            "cache-control": "no-cache, no-transform",
            connection: "keep-alive",
          },
        });
      },
    },
  },
});