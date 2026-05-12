export type ExtractionPayload = {
  tweet_type: "single" | "thread" | "repost_or_quote";
  tweet_content: string;
  thread_tweets?: string[];
  reposted_tweet?: string;
  media?: string[];
  comments?: string[];
};

export function formatForPaste(payload: ExtractionPayload): string {
  const articleContent =
    payload.thread_tweets && payload.thread_tweets.length > 0
      ? [...payload.thread_tweets, payload.tweet_content].join("\n\n")
      : payload.tweet_content;

  const sections = ["# Source Tweet", "", articleContent];

  if (payload.reposted_tweet) {
    sections.push("", "# Referenced Tweet", "", payload.reposted_tweet);
  }

  if (payload.media && payload.media.length > 0) {
    sections.push("", "# Media", "");
    for (const [index, item] of payload.media.entries()) {
      sections.push(`${index + 1}. ${item}`);
    }
  }

  if (payload.comments && payload.comments.length > 0) {
    sections.push("", "# Comments", "");
    for (const [index, comment] of payload.comments.entries()) {
      sections.push(`${index + 1}. ${comment}`);
    }
  }

  return sections.join("\n").trim();
}
