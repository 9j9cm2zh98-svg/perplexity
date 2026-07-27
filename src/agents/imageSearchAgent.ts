import { BaseMessage } from "@langchain/core/messages";
import {
  RunnableSequence,
  RunnableMap,
  RunnableLambda,
} from "@langchain/core/runnables";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

import formatChatHistoryAsString from "../utils/formatHistory";
import { searchSearxng } from "../lib/searxng";

/**
 * REFERENCE — imageSearchAgent (given by the assignment).
 * Group B: rephrase → search → shape list. No reranking, no streaming.
 */

const imageSearchChainPrompt = `
You will be given a conversation below and a follow up question. You need to rephrase the follow-up question so it is a standalone question that can be used by the LLM to search the web for images.
Example:
1. Follow up question: What is a cat?
Rephrased: A cat
2. Follow up question: What is a car? How does it work?
Rephrased: Car working
3. Follow up question: How does an AC work?
Rephrased: AC working
Conversation:
{chat_history}
Follow up question: {query}
Rephrased question:
`;

type ImageSearchInput = {
  chat_history: BaseMessage[];
  query: string;
};

export interface ImageResult {
  img_src: string;
  url: string;
  title: string;
}

const strParser = new StringOutputParser();

const createImageSearchChain = (llm: BaseChatModel) =>
  RunnableSequence.from([
    RunnableMap.from({
      chat_history: (input: ImageSearchInput) =>
        formatChatHistoryAsString(input.chat_history),
      query: (input: ImageSearchInput) => input.query,
    }),
    PromptTemplate.fromTemplate(imageSearchChainPrompt),
    llm,
    strParser,
    RunnableLambda.from(async (input: string) => {
      const res = await searchSearxng(input, {
        categories: ["images"],
        engines: ["bing images", "google images"],
      });
      const results: ImageResult[] = [];
      res.results.forEach((r) => {
        if (r.img_src && r.url && r.title) {
          results.push({ img_src: r.img_src, url: r.url, title: r.title });
        }
      });
      return results.slice(0, 10);
    }),
  ]);

const handleImageSearch = (
  message: string,
  history: BaseMessage[],
  llm: BaseChatModel,
) => createImageSearchChain(llm).invoke({ chat_history: history, query: message });

export default handleImageSearch;
