import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Search,
  Globe,
  GraduationCap,
  MessageSquare,
  Youtube,
  PenLine,
  Image as ImageIcon,
  Film,
  Send,
  Sparkles,
  Link as LinkIcon,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Perplexity — AI-powered answers" },
      {
        name: "description",
        content:
          "Ask anything and get cited, real-time answers across the web, academic papers, Reddit, YouTube, and more.",
      },
      { property: "og:title", content: "Futuresearch — AI-powered answers" },
      {
        property: "og:description",
        content:
          "Ask anything and get cited, real-time answers across the web, academic papers, Reddit, YouTube, and more.",
      },
    ],
  }),
  component: Index,
});

type FocusMode =
  | "web"
  | "academic"
  | "reddit"
  | "youtube"
  | "writing"
  | "images"
  | "videos";

const FOCUS_MODES: {
  id: FocusMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  desc: string;
}[] = [
  {
    id: "web",
    label: "Web",
    icon: Globe,
    desc: "Search the whole web",
  },
  {
    id: "academic",
    label: "Academic",
    icon: GraduationCap,
    desc: "Papers & journals",
  },
  {
    id: "reddit",
    label: "Reddit",
    icon: MessageSquare,
    desc: "Opinions & discussions",
  },
  {
    id: "youtube",
    label: "YouTube",
    icon: Youtube,
    desc: "Video content",
  },
  {
    id: "writing",
    label: "Writing",
    icon: PenLine,
    desc: "No search, just write",
  },
  {
    id: "images",
    label: "Images",
    icon: ImageIcon,
    desc: "Image results",
  },
  {
    id: "videos",
    label: "Videos",
    icon: Film,
    desc: "Video results",
  },
];

interface Source {
  pageContent?: string;
  metadata: {
    title: string;
    url: string;
    img_src?: string;
  };
}

interface ImageResult {
  img_src: string;
  url: string;
  title: string;
}

interface VideoResult {
  img_src: string;
  url: string;
  title: string;
  iframe_src: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  focusMode: FocusMode;
  sources?: Source[];
  images?: ImageResult[];
  videos?: VideoResult[];
  suggestions?: string[];
  error?: string;
  streaming?: boolean;
}

interface StreamEvent {
  type: string;
  data?: unknown;
}

function Index() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [focusMode, setFocusMode] = useState<FocusMode>("web");
  const [busy, setBusy] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /*
   * Auto-scroll while messages are being updated.
   * This works during streaming because every response chunk
   * updates the messages state.
   */
  useEffect(() => {
    const container = scrollRef.current;

    if (!container) {
      return;
    }

    requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;

    });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [busy]);

  const send = useCallback(
    async (text: string, mode: FocusMode) => {
      const query = text.trim();

      if (!query || busy) {
        return;
      }

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: query,
        focusMode: mode,
      };

      const assistantId = crypto.randomUUID();

      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        focusMode: mode,
        streaming: true,
      };

      const history = messages
        .filter((m) => !m.error)
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      setMessages((prev) => [
        ...prev,
        userMsg,
        assistantMsg,
      ]);

      setInput("");
      setBusy(true);

      try {
        console.log("🚀 Sending request:", {
          message: query,
          focusMode: mode,
        });

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            message: query,
            history,
            focusMode: mode,
          }),
        });

        const contentType =
          res.headers.get("content-type") ?? "";

        console.log("📡 Response status:", res.status);
        console.log(
          "📡 Response content type:",
          contentType,
        );

        if (!res.ok) {
          const errorText = contentType.includes("json")
            ? ((await res.json()) as { error?: string }).error
            : await res.text();

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    error: errorText || "Request failed",
                    streaming: false,
                  }
                : m,
            ),
          );

          return;
        }

        /*
         * IMAGE / VIDEO LIST MODE
         */
        if (contentType.includes("application/json")) {
          const payload = (await res.json()) as {
            type: "list";
            data: unknown;
          };

          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) {
                return m;
              }

              if (mode === "images") {
                const images =
                  payload.data as ImageResult[];

                return {
                  ...m,
                  images,
                  content: `Found ${images.length} images for "${query}".`,
                  streaming: false,
                };
              }

              const videos =
                payload.data as VideoResult[];

              return {
                ...m,
                videos,
                content: `Found ${videos.length} videos for "${query}".`,
                streaming: false,
              };
            }),
          );

          return;
        }

        /*
         * STREAMING NDJSON
         */
        if (!res.body) {
          throw new Error(
            "Response body is not available.",
          );
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        let buffer = "";

        const processLine = (line: string) => {
          if (!line.trim()) {
            return;
          }

          let event: StreamEvent;

          try {
            event = JSON.parse(line) as StreamEvent;
          } catch (error) {
            console.error(
              "❌ Failed to parse stream line:",
              line,
              error,
            );

            return;
          }

          console.log(
            "📦 Frontend received:",
            event,
          );

          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) {
                return m;
              }

              if (event.type === "response") {
                return {
                  ...m,
                  content:
                    m.content +
                    String(event.data ?? ""),
                  streaming: true,
                };
              }

              if (event.type === "sources") {
                return {
                  ...m,
                  sources:
                    (event.data ?? []) as Source[],
                };
              }

              if (event.type === "suggestions") {
                return {
                  ...m,
                  suggestions:
                    (event.data ?? []) as string[],
                };
              }

              if (event.type === "error") {
                return {
                  ...m,
                  error: String(
                    event.data ??
                      "Unknown error",
                  ),
                  streaming: false,
                };
              }

              if (event.type === "done") {
                return {
                  ...m,
                  streaming: false,
                };
              }

              return m;
            }),
          );
        };

        while (true) {
          const { done, value } =
            await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, {
            stream: true,
          });

          const lines = buffer.split("\n");

          buffer = lines.pop() ?? "";

          for (const line of lines) {
            processLine(line);
          }
        }

        buffer += decoder.decode();

        if (buffer.trim()) {
          processLine(buffer);
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  streaming: false,
                }
              : m,
          ),
        );
      } catch (error) {
        console.error(
          "❌ Chat request failed:",
          error,
        );

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  error:
                    error instanceof Error
                      ? error.message
                      : String(error),
                  streaming: false,
                }
              : m,
          ),
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, messages],
  );

  const empty = messages.length === 0;

  return (
    <div className="min-h-screen bg-[#fcfbf8] text-neutral-900">
      <header className="sticky top-0 z-10 border-b border-neutral-200/70 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-3">
          <Sparkles className="h-5 w-5 text-emerald-600" />

          <h1 className="text-lg font-semibold tracking-tight">
            Perplexity
          </h1>

          <span className="ml-auto text-xs text-neutral-500">
            Perplexity-style multi-agent search
          </span>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="mx-auto h-[calc(100vh-140px)] max-w-4xl overflow-y-auto px-4 pb-48 pt-8"
      >
        {empty ? (
          <div className="mt-16 text-center">
            <h2 className="font-serif text-4xl tracking-tight">
              Ask anything.
            </h2>

            <p className="mt-3 text-neutral-500">
              Real-time answers with citations across the
              web, papers, Reddit, and YouTube.
            </p>

            <div className="mt-10 grid grid-cols-2 gap-2 text-left md:grid-cols-4">
              {[
                "What's new in quantum computing this month?",
                "Explain transformer attention in simple terms",
                "Best productivity tips from r/getdisciplined",
                "Latest research on GLP-1 drugs",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() =>
                    send(suggestion, focusMode)
                  }
                  className="rounded-xl border border-neutral-200 bg-white p-3 text-sm text-neutral-700 transition hover:border-emerald-400 hover:bg-emerald-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {messages.map((message) => (
              <MessageView
                key={message.id}
                m={message}
                onSuggestionClick={(suggestion) =>
                  send(suggestion, message.focusMode)
                }
              />
            ))}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-neutral-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-4xl px-4 py-3">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {FOCUS_MODES.map((focus) => {
              const Icon = focus.icon;
              const active =
                focusMode === focus.id;

              return (
                <button
                  key={focus.id}
                  onClick={() =>
                    setFocusMode(focus.id)
                  }
                  title={focus.desc}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition ${
                    active
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {focus.label}
                </button>
              );
            })}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              send(input, focusMode);
            }}
            className="flex items-end gap-2 rounded-2xl border border-neutral-300 bg-white p-2 shadow-sm focus-within:border-emerald-500"
          >
            <Search className="ml-1 mt-2 h-5 w-5 text-neutral-400" />

            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) =>
                setInput(event.target.value)
              }
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey
                ) {
                  event.preventDefault();
                  send(input, focusMode);
                }
              }}
              rows={1}
              placeholder={`Ask anything — ${
                FOCUS_MODES.find(
                  (f) => f.id === focusMode,
                )?.label
              }`}
              className="max-h-40 flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none"
              disabled={busy}
            />

            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:opacity-40"
              aria-label="Send"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function MessageView({
  m,
  onSuggestionClick,
}: {
  m: ChatMessage;
  onSuggestionClick: (s: string) => void;
}) {
  if (m.role === "user") {
    return (
      <div className="border-b border-neutral-200 pb-4">
        <div className="mb-1 text-xs uppercase tracking-wide text-neutral-400">
          {m.focusMode}
        </div>

        <div className="font-serif text-2xl tracking-tight">
          {m.content}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {m.sources && m.sources.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <LinkIcon className="h-3.5 w-3.5" />
            Sources
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {m.sources.slice(0, 8).map((source, index) => (
              <a
                key={index}
                href={source.metadata.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg border border-neutral-200 bg-white p-2.5 transition hover:border-emerald-400 hover:bg-emerald-50"
              >
                <div className="truncate text-xs text-neutral-500">
                  {getHostname(source.metadata.url)}
                </div>

                <div className="mt-0.5 line-clamp-2 text-xs font-medium text-neutral-800">
                  {source.metadata.title}
                </div>

                <div className="mt-1 text-[10px] text-neutral-400">
                  [{index + 1}]
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {m.images && m.images.length > 0 && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {m.images.map((image, index) => (
            <a
              key={index}
              href={image.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden rounded-lg border border-neutral-200 bg-white transition hover:border-emerald-400"
            >
              <img
                src={image.img_src}
                alt={image.title}
                loading="lazy"
                className="h-32 w-full object-cover"
              />

              <div className="line-clamp-2 p-1.5 text-[11px] text-neutral-600">
                {image.title}
              </div>
            </a>
          ))}
        </div>
      )}

      {m.videos && m.videos.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {m.videos.map((video, index) => (
            <div
              key={index}
              className="overflow-hidden rounded-lg border border-neutral-200 bg-white"
            >
              <div className="relative aspect-video bg-neutral-100">
                <img
                  src={video.img_src}
                  alt={video.title}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </div>

              <a
                href={video.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-2 text-sm text-neutral-800 hover:text-emerald-700"
              >
                {video.title}
              </a>
            </div>
          ))}
        </div>
      )}

      {(m.content || m.streaming) && (
        <div className="prose prose-sm max-w-none prose-neutral prose-a:text-emerald-700">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {m.content}
          </ReactMarkdown>

          {m.streaming && (
            <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-emerald-600 align-middle" />
          )}
        </div>
      )}

      {m.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {m.error}
        </div>
      )}

      {m.suggestions &&
        m.suggestions.length > 0 && (
          <div className="border-t border-neutral-200 pt-2">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Related
            </div>

            <div className="flex flex-col gap-1">
              {m.suggestions.map(
                (suggestion, index) => (
                  <button
                    key={index}
                    onClick={() =>
                      onSuggestionClick(suggestion)
                    }
                    className="group flex items-center justify-between gap-2 border-b border-neutral-100 py-1.5 text-left text-sm text-neutral-700 transition last:border-0 hover:text-emerald-700"
                  >
                    <span>{suggestion}</span>

                    <Send className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" />
                  </button>
                ),
              )}
            </div>
          </div>
        )}
    </div>
  );
}

function getHostname(url: string) {
  try {
    return new URL(url).hostname.replace(
      "www.",
      "",
    );
  } catch {
    return url;
  }
}