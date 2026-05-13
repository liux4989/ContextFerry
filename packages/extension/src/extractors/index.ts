import { alphaxivExtractor } from "./alphaxiv";
import { readabilityExtractor } from "./readability";
import { redditExtractor } from "./reddit";
import { twitterExtractor } from "./twitter";
import type { PageExtractor } from "./types";

export const extractors: PageExtractor[] = [
  twitterExtractor,
  alphaxivExtractor,
  redditExtractor,
  readabilityExtractor
];
