import { BaseMessage } from "@langchain/core/messages";
import {
  RunnableSequence,
  RunnableMap,
  RunnableLambda,
} from "@langchain/core/runnables";
import {
  PromptTemplate,
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { Document } from "@langchain/core/documents";
import EventEmitter from "events";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Embeddings } from "@langchain/core/embeddings";

import formatChatHistoryAsString from "../utils/formatHistory";
import computeSimilarity from "../utils/computeSimilarity";
import handleStream from "../utils/handleStream";
import { searchSearxng, type SearxngSearchOptions } from "../lib/searxng";

/**
 * Shared factory for Group A (search-and-answer) agents.
 *
 * The academic / reddit / web / youtube agents differ only in:
 *   - retrieverPrompt (rephrase examples per domain)
 *   - responsePrompt  (persona / focus-mode line)
 *   - searxngOptions  (which engines to hit)
 *
 * Everything else — rerank/similarity math, .withConfig run names,
 * eventEmitter+handleStream contract — is identical, so it lives here.
 * See academicSearchAgent.ts for the fully inlined reference version.
 */

export interface SearchAndAnswerAgentConfig {
  retrieverPrompt: string;
  responsePrompt: string;
  searxngOptions: SearxngSearchOptions;
}

type BasicChainInput = {
  chat_history: BaseMessage[];
  query: string;
};

const strParser = new StringOutputParser();

export const createSearchAndAnswerAgent = (
  cfg: SearchAndAnswerAgentConfig,
) => {
  const createRetrieverChain = (llm: BaseChatModel) =>
    RunnableSequence.from([
      PromptTemplate.fromTemplate(cfg.retrieverPrompt),
      llm,
      strParser,
      RunnableLambda.from(async (input: string) => {
        if (input === "not_needed") return { query: "", docs: [] };
        const res = await searchSearxng(input, {
          language: "en",
          ...cfg.searxngOptions,
        });
        const documents = res.results.map(
          (r) =>
            new Document({
              pageContent: r.content ?? "",
              metadata: {
                title: r.title,
                url: r.url,
                ...(r.img_src && { img_src: r.img_src }),
              },
            }),
        );
        return { query: input, docs: documents };
      }),
    ]);

  const createAnsweringChain = (
    llm: BaseChatModel,
    embeddings: Embeddings,
  ) => {
    const retriever = createRetrieverChain(llm);

    const processDocs = async (docs: Document[]) =>
      docs.map((d, i) => `${i + 1}. ${d.pageContent}`).join("\n");

    const rerankDocs = async ({
      query,
      docs,
    }: {
      query: string;
      docs: Document[];
    }) => {
      if (docs.length === 0) return docs;
      const docsWithContent = docs.filter(
        (d) => d.pageContent && d.pageContent.length > 0,
      );
      if (docsWithContent.length === 0) return [];
      const [docEmbeddings, queryEmbedding] = await Promise.all([
        embeddings.embedDocuments(docsWithContent.map((d) => d.pageContent)),
        embeddings.embedQuery(query),
      ]);
      const similarity = docEmbeddings.map((e, i) => ({
        index: i,
        similarity: computeSimilarity(queryEmbedding, e),
      }));
      // Descending — keep the MOST similar documents (section 1.3 audit).
      return similarity
        .sort((a, b) => b.similarity - a.similarity)
        .filter((s) => s.similarity > 0.5)
        .slice(0, 15)
        .map((s) => docsWithContent[s.index]);
    };

    return RunnableSequence.from([
      RunnableMap.from({
        query: (input: BasicChainInput) => input.query,
        chat_history: (input: BasicChainInput) => input.chat_history,
        context: RunnableSequence.from([
          (input: BasicChainInput) => ({
            query: input.query,
            chat_history: formatChatHistoryAsString(input.chat_history),
          }),
          retriever
            .pipe(rerankDocs)
            .withConfig({ runName: "FinalSourceRetriever" })
            .pipe(processDocs),
        ]),
      }),
      ChatPromptTemplate.fromMessages([
        ["system", cfg.responsePrompt],
        new MessagesPlaceholder("chat_history"),
        ["user", "{query}"],
      ]),
      llm,
      strParser,
    ]).withConfig({ runName: "FinalResponseGenerator" });
  };

  return (
    message: string,
    history: BaseMessage[],
    llm: BaseChatModel,
    embeddings: Embeddings,
  ) => {
    const emitter = new EventEmitter();
    try {
      const chain = createAnsweringChain(llm, embeddings);
      const stream = chain.streamEvents(
        { chat_history: history, query: message },
        { version: "v1" },
      );
      handleStream(stream, emitter);
    } catch (err) {
      emitter.emit(
        "error",
        JSON.stringify({
          data: "An error has occurred please try again later",
        }),
      );
      console.error(err);
    }
    return emitter;
  };
};
