import { alphaxivExtractor } from "./alphaxiv";
import { chatgptExtractor } from "./chatgpt";
import { readabilityExtractor } from "./readability";
import { redditExtractor } from "./reddit";
import { twitterExtractor } from "./twitter";
import type { PageExtractor } from "./types";

export const extractors: PageExtractor[] = [
  chatgptExtractor,
  twitterExtractor,
  alphaxivExtractor,
  redditExtractor,
  readabilityExtractor
];
