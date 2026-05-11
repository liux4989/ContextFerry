import { readabilityExtractor } from "./readability";
import { twitterExtractor } from "./twitter";
import type { PageExtractor } from "./types";

export const extractors: PageExtractor[] = [
  twitterExtractor,
  readabilityExtractor
];
