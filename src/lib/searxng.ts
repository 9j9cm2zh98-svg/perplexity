/**
 * Thin wrapper around a SearxNG JSON endpoint.
 *
 * Configure the base URL via SEARXNG_API_URL.
 */

export interface SearxngSearchOptions {
  categories?: string[];
  engines?: string[];
  language?: string;
  pageno?: number;
}

export interface SearxngSearchResult {
  title: string;
  url: string;
  content?: string;
  img_src?: string;
  thumbnail_src?: string;
  thumbnail?: string;
  iframe_src?: string;
  author?: string;
  publishedDate?: string;
}

export interface SearxngSearchResponse {
  results: SearxngSearchResult[];
  suggestions: string[];
}

export const searchSearxng = async (
  query: string,
  opts: SearxngSearchOptions = {},
): Promise<SearxngSearchResponse> => {
  const base = process.env.SEARXNG_API_URL;

  console.log("🔎 SearxNG URL:", base);
  console.log("🔎 Search query:", query);

  if (!base) {
    throw new Error(
      "SEARXNG_API_URL is not configured. Set it to a reachable SearxNG instance.",
    );
  }

  const url = new URL(
    `${base.replace(/\/$/, "")}/search`,
  );

  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");

  if (opts.categories?.length) {
    url.searchParams.set(
      "categories",
      opts.categories.join(","),
    );
  }

  if (opts.engines?.length) {
    url.searchParams.set(
      "engines",
      opts.engines.join(","),
    );
  }

  if (opts.language) {
    url.searchParams.set(
      "language",
      opts.language,
    );
  }

  if (opts.pageno) {
    url.searchParams.set(
      "pageno",
      String(opts.pageno),
    );
  }

  console.log("🌐 Requesting:", url.toString());

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    console.log("⏱️ SearxNG request timed out");
    controller.abort();
  }, 15000);

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    console.log(
      "📡 SearxNG status:",
      res.status,
      res.statusText,
    );

    if (!res.ok) {
      throw new Error(
        `SearxNG request failed: ${res.status} ${res.statusText}`,
      );
    }

    const json =
      (await res.json()) as SearxngSearchResponse;

    console.log(
      "✅ SearxNG results:",
      json.results?.length ?? 0,
    );

    return {
      results: json.results ?? [],
      suggestions: json.suggestions ?? [],
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      throw new Error(
        "SearxNG request timed out after 15 seconds.",
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
};