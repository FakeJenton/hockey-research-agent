import Anthropic from "@anthropic-ai/sdk";

// Server-side only; the key never reaches the browser.
let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (client) return client;
  client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
