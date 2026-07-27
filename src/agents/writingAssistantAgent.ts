import { BaseMessage } from "@langchain/core/messages";
import { RunnableSequence } from "@langchain/core/runnables";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import EventEmitter from "events";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

import handleStream from "../utils/handleStream";

/**
 * writingAssistantAgent — no search, no reranking.
 * One system prompt + chat history + query → LLM → string, streamed via the
 * same FinalResponseGenerator/handleStream contract as Group A so the
 * frontend doesn't need special-case handling.
 */

const writingAssistantPrompt = `
You are futuresearch, an AI writing assistant. The user has selected the 'Writing Assistant' focus mode, which means you should help them with writing, editing, brainstorming, summarizing, and rewriting tasks.
You must NOT perform web searches. Do not cite sources. Rely on the conversation and the user's most recent message.
Be helpful, concise, and match the tone the user requests. Use markdown formatting when it improves readability (headings, lists, code blocks). If the request is ambiguous, ask a clarifying question first rather than guessing.
Today's date is ${new Date().toISOString()}
`;

const strParser = new StringOutputParser();

const createWritingAssistantChain = (llm: BaseChatModel) =>
  RunnableSequence.from([
    ChatPromptTemplate.fromMessages([
      ["system", writingAssistantPrompt],
      new MessagesPlaceholder("chat_history"),
      ["user", "{query}"],
    ]),
    llm,
    strParser,
  ]).withConfig({ runName: "FinalResponseGenerator" });

const handleWritingAssistant = (
  message: string,
  history: BaseMessage[],
  llm: BaseChatModel,
) => {
  const emitter = new EventEmitter();
  try {
    const chain = createWritingAssistantChain(llm);
    const stream = chain.streamEvents(
      { chat_history: history, query: message },
      { version: "v1" },
    );
    handleStream(stream, emitter);
  } catch (err) {
    emitter.emit(
      "error",
      JSON.stringify({ data: "An error has occurred please try again later" }),
    );
    console.error(err);
  }
  return emitter;
};

export default handleWritingAssistant;
