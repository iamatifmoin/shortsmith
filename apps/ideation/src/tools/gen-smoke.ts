/**
 * Generation smoke test — run the scriptwriter prompt against a sample fact via
 * the real LLM and print the parsed script + visual + source. Validates the B-tone
 * rewrite and the visual-spec output without the full DB/pipeline.
 *
 *   pnpm --filter @shortsmith/ideation build && pnpm --filter @shortsmith/ideation gen:smoke
 */
import { createLlmProvider } from '@shortsmith/llm';

import { buildGenerateMessages, buildGenerateSystem, parseScript } from '../modules/generate/prompts';

async function main(): Promise<void> {
  const llm = createLlmProvider();
  // A neutral sample fact so the smoke test is niche-agnostic (the real subject
  // comes from channel config at runtime).
  const fact =
    'The new flagship phone ships with a 200-megapixel camera, double the resolution of the previous model.';
  const snippets = [
    'The launch event confirmed a 200MP main sensor on the new flagship.',
    "Reviewers note the resolution is twice the prior generation's 100MP sensor.",
  ];

  const res = await llm.complete(buildGenerateMessages(fact, snippets), {
    system: buildGenerateSystem({
      subjectName: 'the new flagship phone',
      subjectAliases: ['the phone'],
      personality: 'Confident, upbeat, and clued-in.',
      formatRules: { maxFactAgeDays: 120 },
      publish: { emoji: false, maxHashtags: 5 },
    }),
    temperature: 0.8,
    maxTokens: 1500,
  });

  const parsed = parseScript(res.text);
  if (!parsed) {
    console.error('UNPARSEABLE:\n', res.text.slice(0, 400));
    process.exit(1);
    return;
  }

  console.log('HOOK  :', parsed.hook);
  console.log('BODY  :', parsed.body);
  console.log('CTA   :', parsed.cta);
  console.log('SOURCE:', parsed.source);
  console.log('VISUAL:', JSON.stringify(parsed.visual));
  console.log('TITLE :', parsed.title);
  console.log('THUMB :', parsed.thumbnailText);
  console.log('IG    :', parsed.igCaption);
}

main().catch((err) => {
  console.error('gen smoke failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
