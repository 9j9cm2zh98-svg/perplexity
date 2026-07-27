import type { BaseMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Embeddings } from "@langchain/core/embeddings";
import type EventEmitter from "events";

import handleAcademicSearch from "./academicSearchAgent";
import handleRedditSearch from "./redditSearchAgent";
import handleWebSearch from "./webSearchAgent";
import handleYoutubeSearch from "./youtubeSearchAgent";
import handleImageSearch from "./imageSearchAgent";
import handleVideoSearch from "./videoSearchAgent";
import handleWritingAssistant from "./writingAssistantAgent";
import generateSuggestions from "./suggestionGeneratorAgent";

export {
  handleAcademicSearch,
  handleRedditSearch,
  handleWebSearch,
  handleYoutubeSearch,
  handleImageSearch,
  handleVideoSearch,
  handleWritingAssistant,
  generateSuggestions,
};

export type StreamingFocusMode =
  | "academic"
  | "reddit"
  | "web"
  | "youtube"
  | "writing";

export type ListFocusMode = "images" | "videos";

export type FocusMode = StreamingFocusMode | ListFocusMode;

type SearchStreamingHandler = (
  message: string,
  history: BaseMessage[],
  llm: BaseChatModel,
  embeddings: Embeddings,
) => EventEmitter;

type WritingHandler = (
  message: string,
  history: BaseMessage[],
  llm: BaseChatModel,
) => EventEmitter;

type ListHandler = (
  message: string,
  history: BaseMessage[],
  llm: BaseChatModel,
) => Promise<unknown>;

const searchStreamingAgents: Record<
  Exclude<StreamingFocusMode, "writing">,
  SearchStreamingHandler
> = {
  academic: handleAcademicSearch,
  reddit: handleRedditSearch,
  web: handleWebSearch,
  youtube: handleYoutubeSearch,
};

const writingAgent: WritingHandler = handleWritingAssistant;

const listAgents: Record<ListFocusMode, ListHandler> = {
  images: handleImageSearch,
  videos: handleVideoSearch,
};

export const dispatchFocusMode = (
  mode: FocusMode,
  message: string,
  history: BaseMessage[],
  llm: BaseChatModel,
  embeddings?: Embeddings,
): EventEmitter | Promise<unknown> => {
  if (mode === "writing") {
    return writingAgent(message, history, llm);
  }

  if (
    mode === "academic" ||
    mode === "reddit" ||
    mode === "web" ||
    mode === "youtube"
  ) {
    if (!embeddings) {
      throw new Error(
        "Embeddings are required for this search mode.",
      );
    }

    return searchStreamingAgents[mode](
      message,
      history,
      llm,
      embeddings,
    );
  }

  if (mode === "images" || mode === "videos") {
    return listAgents[mode](message, history, llm);
  }

  throw new Error(`Unknown focus mode: ${mode}`);
};