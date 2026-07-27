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

const videoSearchChainPrompt = `
You will be given a conversation below and a follow up question. You need to rephrase the follow-up question so it is a standalone question that can be used by the LLM to search YouTube for videos.
Example:
1. Follow up question: What is a black hole?
Rephrased: Black hole explained video
2. Follow up question: How does a transformer neural network work?
Rephrased: Transformer neural network working
3. Follow up question: Best guitar solos of all time
Rephrased: Best guitar solos of all time
Conversation:
{chat_history}
Follow up question: {query}
Rephrased question:
`;

type VideoSearchInput = {
  chat_history: BaseMessage[];
  query: string;
};

export interface VideoResult {
  img_src: string; // mapped from result.thumbnail — frontend expects img_src across image + video results
  url: string;
  title: string;
  iframe_src: string;
}

const strParser = new StringOutputParser();

const createVideoSearchChain = (llm: BaseChatModel) =>
  RunnableSequence.from([
    RunnableMap.from({
      chat_history: (input: VideoSearchInput) =>
        formatChatHistoryAsString(input.chat_history),
      query: (input: VideoSearchInput) => input.query,
    }),
    PromptTemplate.fromTemplate(videoSearchChainPrompt),
    llm,
    strParser,
    RunnableLambda.from(async (input: string) => {
      const res = await searchSearxng(input, { engines: ["youtube"] });
      const results: VideoResult[] = [];
      res.results.forEach((r) => {
        if (r.thumbnail && r.url && r.title && r.iframe_src) {
          results.push({
            img_src: r.thumbnail,
            url: r.url,
            title: r.title,
            iframe_src: r.iframe_src,
          });
        }
      });
      return results.slice(0, 10);
    }),
  ]);

const handleVideoSearch = (
  message: string,
  history: BaseMessage[],
  llm: BaseChatModel,
) => createVideoSearchChain(llm).invoke({ chat_history: history, query: message });

export default handleVideoSearch;
