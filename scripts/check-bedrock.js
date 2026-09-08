#!/usr/bin/env node
/**
 * Diagnoses Bedrock access end to end and says exactly which link in the chain is broken.
 *
 *   npm run bedrock:check
 *
 * The narrative panel never depends on this working — it falls back to deterministic prose.
 * This exists so you can tell the difference between "not configured" and "misconfigured".
 */
import '../server/env.js';
import { narrativeStatus } from '../server/narrative.js';

const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
const CONFIGURED = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-opus-5';

// Cross-region inference profiles ("us." prefix) are how newer models are invoked on the
// legacy runtime — a bare model id returns "on-demand throughput isn't supported".
const CANDIDATES = [
  { id: CONFIGURED, path: 'mantle' },
  { id: 'anthropic.claude-sonnet-5', path: 'mantle' },
  { id: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0', path: 'legacy' },
  { id: 'anthropic.claude-3-haiku-20240307-v1:0', path: 'legacy' },
];

const status = narrativeStatus();
console.log('Configuration');
console.log(`  credentials   ${status.credentialSource}`);
console.log(`  region        ${REGION}`);
console.log(`  model         ${CONFIGURED}\n`);

if (!status.bedrockConfigured) {
  console.log('No AWS credentials found. Run `aws configure`, or set AWS_ACCESS_KEY_ID and');
  console.log('AWS_SECRET_ACCESS_KEY. The narrative panel will use deterministic prose meanwhile.');
  process.exit(0);
}

const { AnthropicBedrock, AnthropicBedrockMantle } = await import('@anthropic-ai/bedrock-sdk');
const clients = {
  mantle: new AnthropicBedrockMantle({ awsRegion: REGION }),
  legacy: new AnthropicBedrock({ awsRegion: REGION }),
};

console.log('Probing models');
let working = null;

for (const { id, path } of CANDIDATES) {
  try {
    const res = await clients[path].messages.create({
      model: id,
      max_tokens: 16,
      messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
    });
    const text = res.content.find((b) => b.type === 'text')?.text?.trim();
    console.log(`  OK       ${id}  (${path}) -> ${text}`);
    working ??= { id, path };
  } catch (err) {
    const raw = String(err.message).replace(/\s+/g, ' ');
    const reason = /INVALID_PAYMENT_INSTRUMENT/.test(raw)
      ? 'no valid payment method on the AWS account'
      : /on-demand throughput/i.test(raw)
        ? 'needs a cross-region inference profile (us. prefix)'
        : /not available for this account/i.test(raw)
          ? 'model access not granted for this account'
          : /404/.test(raw)
            ? 'not served on this endpoint'
            : raw.slice(0, 90);
    console.log(`  blocked  ${id}  (${path}) -> ${reason}`);
  }
}

console.log('');
if (working) {
  console.log(`Bedrock is working. Set BEDROCK_MODEL_ID=${working.id} in .env`);
  if (working.path === 'legacy') {
    console.log('Note: that id runs on the legacy runtime — server/narrative.js uses the Mantle');
    console.log('client, so switch it to AnthropicBedrock for this model.');
  }
} else {
  console.log('No Anthropic model is invokable on this account. Most likely, in order:');
  console.log('  1. Add a payment method   console.aws.amazon.com/billing/home#/paymentmethods');
  console.log('  2. Request model access   console.aws.amazon.com/bedrock -> Model access');
  console.log('  3. Re-run                 npm run bedrock:check');
  console.log('\nThe Intelligence page works regardless — the narrative falls back to');
  console.log('deterministic prose composed from the same computed figures.');
}
