import { BaseOutputParser } from "@langchain/core/output_parsers";

interface ListLineOutputParserArgs {
  key?: string;
}

/**
 * Parses a block wrapped in <key> ... </key> where each non-empty line is
 * treated as one list item. Used by suggestionGeneratorAgent to pull
 * follow-up chips out of the model response.
 */
class ListLineOutputParser extends BaseOutputParser<string[]> {
  static lc_name() {
    return "ListLineOutputParser";
  }

  lc_namespace = ["perplrxity", "output_parsers", "list_line"];

  private key: string;

  constructor(args: ListLineOutputParserArgs = {}) {
    super();
    this.key = args.key ?? "list";
  }

  async parse(text: string): Promise<string[]> {
    const open = `<${this.key}>`;
    const close = `</${this.key}>`;
    const start = text.indexOf(open);
    const end = text.indexOf(close);

    const inner =
      start === -1 || end === -1 || end <= start
        ? text
        : text.slice(start + open.length, end);

    return inner
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
      .filter((line) => line.length > 0);
  }

  getFormatInstructions(): string {
    return `Wrap your output in <${this.key}> ... </${this.key}> with one item per line.`;
  }
}

export default ListLineOutputParser;
