import { BaseMessage } from "@langchain/core/messages";
import { RunnableSequence, RunnableMap } from "@langchain/core/runnables";
import { PromptTemplate } from "@langchain/core/prompts";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

import formatChatHistoryAsString from "../utils/formatHistory";
import ListLineOutputParser from "../lib/outputParsers/listLineOutputParser";

/**
 * suggestionGeneratorAgent — plain .invoke(), NOT streamed.
 *
 * Intended flow (documented per assignment section 4):
 *   Call this AFTER the primary search/writing agent finishes streaming,
 *   with the updated chat_history (including the new AI response appended),
 *   so the frontend can show follow-up chips underneath the answer. We keep
 *   it as a standalone function that the same route handler invokes right
 *   after the main stream ends — no separate endpoint needed.
 */

const suggestionGeneratorPrompt = `
You are an AI suggestion generator for an AI-powered search engine. Given the conversation so far, produce 4-5 medium-length, relevant follow-up questions the user might reasonably ask next.
Rules:
- The suggestions must build on the conversation, not restate it.
- Each suggestion should be a natural, standalone question the user could click.
- Do NOT number them and do NOT add prefixes like "Q:".
- Output exactly one suggestion per line.
- Wrap the whole list in <suggestions> ... </suggestions> tags and put nothing outside those tags.

Conversation:
{chat_history}
`;

const outputParser = new ListLineOutputParser({ key: "suggestions" });

type SuggestionInput = {
  chat_history: BaseMessage[];
};

const createSuggestionGeneratorChain = (llm: BaseChatModel) =>
  RunnableSequence.from([
    RunnableMap.from({
      chat_history: (input: SuggestionInput) =>
        formatChatHistoryAsString(input.chat_history),
    }),
    PromptTemplate.fromTemplate(suggestionGeneratorPrompt),
    llm,
    outputParser,
  ]);

const generateSuggestions = (
  input: SuggestionInput,
  llm: BaseChatModel,
): Promise<string[]> => {
  // Force temperature = 0 for consistent, less repetitive suggestions.
  // Mutating the llm instance is intentional per the assignment; the
  // reference code does the same rather than plumbing an option through.
  (llm as unknown as { temperature: number }).temperature = 0;
  return createSuggestionGeneratorChain(llm).invoke(input);
};

export default generateSuggestions;
