/**
 * The demo story, as data.
 *
 * `values` are the monthly metric figures the generated source files must roll up to.
 * The generators solve backwards from these, so the raw extracts look organic while the
 * SLA engine reproduces exactly the RAG picture the demo needs.
 *
 * Two months, chosen for realism as of early September 2026:
 *   2026-07  prior reporting month, closed off, all 5 sources present, calm picture
 *   2026-08  current reporting month being closed, 4 sources present + 1 held back
 *
 * The August Excel tracker lives in data/holdback/ and is dragged in mid-demo:
 * complaint resolution TAT flips from "no data" to a service-credit RED and the
 * pack timestamp moves. That is the whole "always current" beat in one file.
 */

export const MONTHS = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];

/** Months produced as Phase 2 backfill rather than run through the Phase 1 demo. */
export const BACKFILL_MONTHS = ['2026-04', '2026-05', '2026-06'];

/**
 * Phase 2 needs a history with shape, not noise. Four deliberate patterns run through the
 * six months so the intelligence layer has something real to find:
 *
 *   STEADY DECLINE   complaint and escalation resolution climb every single month, so a
 *                    trend model predicts the October breach rather than guessing it
 *   STABLE           endorsement TAT, STP accuracy and uptime barely move — proof the risk
 *                    panel is not simply flagging everything
 *   SEASONAL         contact centre load spikes in June and August, which is what makes
 *                    demand forecasting demonstrable
 *   RECURRING CAUSE  underwriting delay concentrates in the same two branches every month
 *                    (see BRANCH_SKEW), which is what clustering is meant to surface
 */
export const HISTORY_PATTERNS = {
  steadyDecline: ['MAN_COMPLAINT_TAT', 'MAN_ESCALATION_TAT'],
  stable: ['BANCS_ENDORSE_TAT', 'BANCS_STP_ACC', 'AZ_UPTIME'],
  seasonal: ['AWS_ASA', 'AWS_ABANDON', 'AWS_AHT'],
  recurringCause: ['BANCS_UW_TAT', 'BANCS_CLAIMS_TAT'],
};

/**
 * Persistent operational weak spots, applied on top of each month's target mean so the
 * monthly figure is unchanged but the record-level detail carries a consistent story.
 * Multipliers are relative to the process mean.
 */
export const BRANCH_SKEW = {
  Underwriting: { Cork: 1.55, Galway: 1.42, Dublin: 0.82, Limerick: 0.86, Waterford: 0.9 },
  Claim: { Waterford: 1.48, Cork: 1.15, Dublin: 0.85, Galway: 0.92, Limerick: 0.88 },
};

/** Contact centre load relative to a normal month — drives the seasonality story. */
export const CALL_VOLUME = {
  '2026-04': 0.94, '2026-05': 0.97, '2026-06': 1.22,
  '2026-07': 1.0, '2026-08': 1.26, '2026-09': 1.02,
};

/**
 * Filenames are deliberately uninformative - the way files actually look in someone's
 * Downloads folder. Source identification must come from content and structure alone,
 * so nothing in the pipeline is allowed to read a filename for a hint.
 */
export const SCENARIO = {
  // ---------------------------------------------------------------- backfill
  '2026-04': {
    seed: 20260401,
    generatedOn: 1,
    holdback: [],
    azureCoverage: 'full',
    provenance: 'synthetic-backfill',
    files: {
      bancs: 'export_20260430_0604.xlsx', awsConnect: 'report.csv', azure: 'Document.pdf',
      tracker: 'Book.xlsx', emailFeed: 'Print_Output_Apr.pdf',
    },
    values: {
      BANCS_NB_TAT: 4.0, BANCS_UW_TAT: 2.2, BANCS_CLAIMS_TAT: 8.8, BANCS_ENDORSE_TAT: 3.4,
      BANCS_STP_ACC: 98.8, AWS_ASA: 16.8, AWS_ABANDON: 3.8, AWS_AHT: 335, AWS_QA: 92.4,
      AZ_UPTIME: 99.78, AZ_BATCH: 99.3, AZ_REFRESH: 97.4,
      MAN_COMPLAINT_TAT: 5.8, MAN_ESCALATION_TAT: 1.2,
    },
    volumes: {
      bancs: { 'New Business': 60, Underwriting: 47, Claim: 26, Endorsement: 34, rework: 2 },
      complaints: { closed: 25, open: 3 },
      escalationsPerWeek: [4, 5, 4, 4, 3],
    },
  },

  '2026-05': {
    seed: 20260501,
    generatedOn: 1,
    holdback: [],
    azureCoverage: 'full',
    provenance: 'synthetic-backfill',
    files: {
      bancs: 'export_20260531_0558.xlsx', awsConnect: 'report (1).csv', azure: 'Document2.pdf',
      tracker: 'Book3.xlsx', emailFeed: 'Print_Output_May.pdf',
    },
    values: {
      BANCS_NB_TAT: 4.1, BANCS_UW_TAT: 2.4, BANCS_CLAIMS_TAT: 9.6, BANCS_ENDORSE_TAT: 3.5,
      BANCS_STP_ACC: 98.7, AWS_ASA: 17.2, AWS_ABANDON: 4.0, AWS_AHT: 338, AWS_QA: 92.0,
      AZ_UPTIME: 99.74, AZ_BATCH: 99.1, AZ_REFRESH: 96.9,
      MAN_COMPLAINT_TAT: 6.3, MAN_ESCALATION_TAT: 1.5,
    },
    volumes: {
      bancs: { 'New Business': 56, Underwriting: 43, Claim: 24, Endorsement: 31, rework: 2 },
      complaints: { closed: 20, open: 3 },
      escalationsPerWeek: [5, 4, 5, 4, 4],
    },
  },

  '2026-06': {
    seed: 20260601,
    generatedOn: 1,
    holdback: [],
    azureCoverage: 'full',
    provenance: 'synthetic-backfill',
    files: {
      bancs: 'export_20260630_0611.xlsx', awsConnect: 'report (4).csv', azure: 'Document5.pdf',
      tracker: 'Book5.xlsx', emailFeed: 'Print_Output_Jun.pdf',
    },
    values: {
      BANCS_NB_TAT: 4.2, BANCS_UW_TAT: 2.5, BANCS_CLAIMS_TAT: 11.2, // first claims breach
      BANCS_ENDORSE_TAT: 3.4, BANCS_STP_ACC: 98.7,
      AWS_ASA: 19.4, AWS_ABANDON: 4.9, AWS_AHT: 356, AWS_QA: 91.6, // summer load
      AZ_UPTIME: 99.71, AZ_BATCH: 98.6, AZ_REFRESH: 96.5,
      MAN_COMPLAINT_TAT: 6.9, MAN_ESCALATION_TAT: 1.7,
    },
    volumes: {
      bancs: { 'New Business': 84, Underwriting: 65, Claim: 36, Endorsement: 46, rework: 3 },
      complaints: { closed: 20, open: 4 },
      escalationsPerWeek: [5, 6, 5, 5, 4],
    },
  },

  // ------------------------------------------------ produced via the Phase 1 demo
  '2026-07': {
    seed: 20260701,
    generatedOn: 5, // day of the FOLLOWING month the extracts were produced
    holdback: [],
    azureCoverage: 'full',
    files: {
      bancs: 'export_20260731_0612.xlsx',
      awsConnect: 'report (2).csv',
      azure: 'Document1.pdf',
      tracker: 'Book1.xlsx',
      emailFeed: 'Print_Output.pdf',
    },
    values: {
      BANCS_NB_TAT: 4.3,
      BANCS_UW_TAT: 2.6,
      BANCS_CLAIMS_TAT: 12.4, // RED, service-credit
      BANCS_ENDORSE_TAT: 3.5,
      BANCS_STP_ACC: 98.6,
      AWS_ASA: 18.2,
      AWS_ABANDON: 4.2,
      AWS_AHT: 342,
      AWS_QA: 91.4,
      AZ_UPTIME: 99.72,
      AZ_BATCH: 97.9, // RED
      AZ_REFRESH: 96.2,
      MAN_COMPLAINT_TAT: 7.4,
      MAN_ESCALATION_TAT: 1.8,
    },
    volumes: {
      bancs: { 'New Business': 52, Underwriting: 41, Claim: 22, Endorsement: 28, rework: 2 },
      complaints: { closed: 26, open: 3 },
      escalationsPerWeek: [5, 4, 6, 5, 3],
    },
  },

  '2026-08': {
    seed: 20260801,
    generatedOn: 2,
    holdback: ['tracker'],
    azureCoverage: 'partial', // report cut on 24 Aug -> stale-data flag
    files: {
      bancs: 'export_20260831_0559.xlsx',
      awsConnect: 'report (5).csv',
      azure: 'Document3.pdf',
      tracker: 'Book4.xlsx',
      emailFeed: 'Print_Output (2).pdf',
    },
    values: {
      BANCS_NB_TAT: 4.8,
      BANCS_UW_TAT: 3.2, // AMBER
      BANCS_CLAIMS_TAT: 11.1, // RED, service-credit
      BANCS_ENDORSE_TAT: 3.8,
      BANCS_STP_ACC: 97.9, // AMBER
      AWS_ASA: 24.1, // RED
      AWS_ABANDON: 6.1, // RED, service-credit
      AWS_AHT: 371, // AMBER
      AWS_QA: 89.2, // AMBER
      AZ_UPTIME: 99.31, // RED, service-credit
      AZ_BATCH: 98.7, // AMBER
      AZ_REFRESH: 91.5, // RED
      MAN_COMPLAINT_TAT: 9.2, // RED, service-credit - arrives on the mid-demo upload
      MAN_ESCALATION_TAT: 2.4, // RED, service-credit
    },
    volumes: {
      bancs: { 'New Business': 68, Underwriting: 55, Claim: 31, Endorsement: 36, rework: 4 },
      complaints: { closed: 31, open: 5 },
      escalationsPerWeek: [6, 7, 5, 6, 4],
    },
  },

  /**
   * The recovery month, and the one uploaded live during the demo.
   *
   * August's remediation has landed: claims processing is back inside target and the
   * contact centre has recovered. 12 of 15 on target, 1 amber, 1 breach. The single breach
   * is deliberate - a month with nothing in it makes the exceptions view look untested, and
   * a service-credit breach carried over from August gives the room something to discuss.
   */
  '2026-09': {
    seed: 20260901,
    generatedOn: 1,
    holdback: [],
    azureCoverage: 'full',
    files: {
      bancs: 'export_20260930_0621.xlsx',
      awsConnect: 'report (8).csv',
      azure: 'Document7.pdf',
      tracker: 'Book2.xlsx',
      emailFeed: 'Print_Output (3).pdf',
    },
    values: {
      BANCS_NB_TAT: 4.1,
      BANCS_UW_TAT: 2.4,
      BANCS_CLAIMS_TAT: 9.2, // recovered from August's breach
      BANCS_ENDORSE_TAT: 3.4,
      BANCS_STP_ACC: 98.9,
      AWS_ASA: 17.5,
      AWS_ABANDON: 4.4,
      AWS_AHT: 348,
      AWS_QA: 92.1,
      AZ_UPTIME: 99.68,
      AZ_BATCH: 99.2,
      AZ_REFRESH: 96.8,
      MAN_COMPLAINT_TAT: 8.4, // AMBER
      MAN_ESCALATION_TAT: 2.6, // RED, service-credit
    },
    volumes: {
      bancs: { 'New Business': 65, Underwriting: 52, Claim: 29, Endorsement: 36, rework: 2 },
      complaints: { closed: 25, open: 4 },
      escalationsPerWeek: [5, 6, 5, 4, 3],
    },
  },
};

export const BRANCHES = ['Dublin', 'Cork', 'Galway', 'Limerick', 'Waterford'];

export const QUEUES = [
  { name: 'Policy Servicing', share: 0.38 },
  { name: 'New Business Enquiries', share: 0.24 },
  { name: 'Claims Support', share: 0.23 },
  { name: 'Complaints', share: 0.15 },
];

export const AZURE_SERVICES = {
  availability: [
    { service: 'bancs-policy-api', region: 'North Europe' },
    { service: 'aibl-customer-portal', region: 'North Europe' },
    { service: 'doc-generation-svc', region: 'West Europe' },
  ],
  batch: [
    { service: 'nightly-policy-batch', region: 'North Europe' },
    { service: 'premium-collection-job', region: 'North Europe' },
  ],
  refresh: [
    { service: 'dw-refresh-pipeline', region: 'North Europe' },
    { service: 'reporting-distribution', region: 'West Europe' },
  ],
};

export const COMPLAINT_CATEGORIES = [
  'Premium Collection',
  'Claims Handling',
  'Policy Documentation',
  'Adviser Conduct',
  'Servicing Delay',
  'Charges & Fees',
];

export const COMPLAINT_OWNERS = ['M. Byrne', 'S. O’Connell', 'D. Fitzgerald', 'A. Nolan', 'R. Kavanagh'];

export const ESCALATION_CATEGORIES = [
  'Payment delay',
  'Claim decision dispute',
  'Missing policy documents',
  'Data correction request',
  'Adviser complaint',
  'Portal access failure',
];
