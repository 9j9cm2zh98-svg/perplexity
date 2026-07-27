import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";

const formatChatHistoryAsString = (history: BaseMessage[]) => {
  return history
    .map((message) => {
      if (message instanceof HumanMessage) return `User: ${message.content}`;
      if (message instanceof AIMessage) return `Assistant: ${message.content}`;
      return `${message._getType()}: ${message.content}`;
    })
    .join("\n");
};

export default formatChatHistoryAsString;
