import { adaptBancs } from './bancs.js';
import { adaptAwsConnect } from './awsConnect.js';
import { adaptAzure } from './azure.js';
import { adaptTracker } from './tracker.js';
import { adaptEmailFeed } from './emailFeed.js';

/**
 * One adapter per source type. Each turns a parsed document into metric values.
 * The classifier decides WHICH adapter runs; the adapter itself is fully deterministic,
 * so no SLA number on screen ever originates from a model.
 */
export const ADAPTERS = {
  bancs: adaptBancs,
  awsConnect: adaptAwsConnect,
  azure: adaptAzure,
  tracker: adaptTracker,
  emailFeed: adaptEmailFeed,
};

export function runAdapter(sourceId, doc) {
  const fn = ADAPTERS[sourceId];
  if (!fn) return { metrics: {}, error: `No adapter registered for source "${sourceId}"` };
  try {
    return fn(doc);
  } catch (err) {
    return { metrics: {}, error: `Adapter failed: ${err.message}` };
  }
}
