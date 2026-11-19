import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

// Reads ANTHROPIC_API_KEY (or an `ant auth login` profile) from the environment.
export const client = new Anthropic();

export const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5-5";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

type ImageInput = { base64: string; mediaType: "image/jpeg" | "image/png" };

/**
 * One structured-output call. Returns the parsed object or throws.
 * Server-side refusal fallback is on ("default" routing) so a rare safety
 * decline is retried on a fallback model instead of failing the scan.
 */
export async function structuredCall<S extends z.ZodType>(opts: {
  schema: S;
  system: string;
  text: string;
  images?: ImageInput[];
  effort?: Effort;
  maxTokens?: number;
}): Promise<z.infer<S>> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...(opts.images ?? []).map(
      (img): Anthropic.Beta.BetaContentBlockParam => ({
        type: "image",
        source: { type: "base64", media_type: img.mediaType, data: img.base64 },
      }),
    ),
    { type: "text", text: opts.text },
  ];

  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: opts.effort ?? "low",
      format: betaZodOutputFormat(opts.schema),
    },
    system: opts.system,
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(
      `Model declined: ${response.stop_details?.explanation ?? "no explanation"}`,
    );
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Response truncated (max_tokens)");
  }
  if (!response.parsed_output) {
    throw new Error("Model output did not match schema");
  }
  return response.parsed_output as z.infer<S>;
}
