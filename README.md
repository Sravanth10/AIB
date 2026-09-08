# AIB Life · SLA Governance — Phase 1 Prototype

Turns a pile of unlabelled monthly extracts into a governance pack: files are identified
from their own structure, consolidated into 15 SLAs, scored against contracted thresholds,
and published as an exportable pack — one current version per reporting month.

## Run it

```bash
npm install
npm run seed     # generate the synthetic source files (already committed under data/)
npm run dev      # API on :5174, UI on :5173
```

Open **http://localhost:5173**. To run everything from a single process instead:

```bash
npm run preview  # builds the UI and serves it from the API on :5174
```

### Resetting between rehearsals

```bash
npm run demo              # rebuild the exact demo starting state
npm run reset -- 2026-09  # close just September, leave July and August alone
npm run reset             # close every period
```

`npm run demo` puts July (5 sources, 2 breaches) and August (4 sources, 6 breaches, tracker
held back) on the dashboard and leaves September closed for the live run. It drives the same
pipeline the UI does, so a prepared state is indistinguishable from a hand-driven one.

> **Stop the server before running any of these.** On Windows a running server holds handles
> on the uploaded files and the delete silently fails to complete — you get a period that
> looks cleared but comes back. `prepare-demo.js` fails loudly if it hits this.

## Brand asset

Save the official AIB Life logo as **`public/aib-life-logo.png`**. It appears in the sidebar,
on the governance pack masthead, and as the browser tab icon. Until it is added, a neutral
wordmark stands in — the app never renders a broken image. `npm run dev` picks the file up
live; `npm run preview` needs a rebuild after adding it.

## Demo script

The app opens on the **governance dashboard**: the reporting periods already closed off
(July and August), with their RAG split, breach count and service-credit exposure. A period
only appears once it has been opened — sample files on disk do not conjure one into being.

**The live run — September 2026**

1. Click **Start SLA governance for current month**. A new reporting period opens and lands
   on the ingest screen.
2. Drag all five files from `data/seed/2026-09/` onto the drop zone —
   `export_20260930_0621.xlsx`, `report (8).csv`, `Document7.pdf`, `Book2.xlsx`,
   `Print_Output (3).pdf`. Nothing in those names says what they are.
3. Each resolves at 92–97% confidence with the structural evidence shown underneath.
   The checklist reads **5 of 5 sources received**.
4. **Generate governance pack** → 12 on target, 1 at risk, 1 breach, 1 unscored. September
   is the recovery month: August's claims-processing breach is back inside target.
5. **SLA exceptions** → the one remaining breach is escalation resolution, service-credit
   linked. **Governance pack** → *Export as PDF*.
6. **Dashboard** → September now sits alongside July and August, 7 breaches down to 1.

**The "always current" beat — August 2026**

Open August from the dashboard. Its ingest screen is labelled **Initiate re-ingestion**,
because a pack already exists for the period — same screen, different intent. Click
**Late-arriving file** (or drop `data/holdback/Book4.xlsx`). It classifies as the Excel
tracker at 94% — its header sits on row 5 behind a merged title block. The stamp switches to
*"New evidence since last run"*. **Regenerate** → complaint resolution TAT appears at
9.2 days, breaches go 6 → 7, service-credit exposure 4 → 5, and the timestamp moves.

To rehearse that beat again, delete the tracker from August's list with the ✕ and regenerate,
or run `npm run demo`.

## How it works

```
file ─▶ parse (xlsx │ csv │ pdf) ─▶ classify as a set ─▶ confirm/correct
     ─▶ source adapter ─▶ SLA engine ─▶ data quality ─▶ pack
```

**Classification uses content only.** Filenames are never inspected — the sample files are
deliberately named like real downloads to make that visible. Each source has a structural
fingerprint in [`config/source-templates.json`](config/source-templates.json): required and
signature column headers, distinctive vocabulary, document shape, and negative markers that
argue against a match.

**Files are classified as a set, not one by one.** The five sources are distinct, so an
upload of five files is an assignment problem. Resolving it jointly rescues ambiguous
files — a scruffy spreadsheet lands on "Excel tracker" because the BaNCS slot is already
claimed at high confidence. When set resolution overrides a file's own first choice, the UI
says so and caps the confidence.

**The model classifies; rules calculate.** Every SLA figure comes from a deterministic
adapter in [`server/adapters/`](server/adapters/). No number in the pack is model-generated.

**Reporting month comes from content too.** Every source carries its own period internally,
so a file filed under the wrong month is flagged rather than silently mis-bucketed.

**One current pack per month.** `POST /api/generate/:month` re-reads every file uploaded for
that period and overwrites `data/analyses/<month>.json`. No parallel drafts.

## The 15 metrics

Defined in [`config/sla-metrics.json`](config/sla-metrics.json) — target, direction,
absolute amber tolerance, source, service-credit flag. Tolerance is absolute rather than a
percentage: a 10% band around a 99.5% uptime target would stretch to 89.5%.

| Source | Metrics |
|---|---|
| BaNCS extract | new business TAT, underwriting TAT, claims TAT, endorsement TAT, STP accuracy |
| AWS Connect report | speed to answer, abandonment, **FCR — no source column**, handle time, QA |
| Azure operational report | availability, batch success, refresh timeliness |
| Excel tracker | complaint resolution TAT |
| Email feed | escalation resolution time |

First Call Resolution has no source anywhere by design. It surfaces as a live data-quality
gap rather than a fabricated number — the point being that gaps are stated, not estimated.

## Synthetic data

`npm run seed` regenerates all 15 files (3 months × 5 sources) deterministically from
[`scripts/scenario.js`](scripts/scenario.js), which holds the demo story as data: which
month lands where on the RAG scale, which file is held back, how much coverage the Azure
export has. Change a target there and the raw extracts re-solve to match it.

Planted defects the data-quality engine finds: no FCR column, August's Azure export cut 10
days before period end, a duplicated complaint reference, open cases with blank close dates,
and hand-typed dates mixed with real date cells in one column.

---

# Phase 2 — Operational Intelligence

Phase 1 reports what happened. Phase 2 reads the history Phase 1 produces and says what is
coming. It does not replace the pipeline — it analyses its output.

Open it from the **Intelligence** control docked to the right edge of any governance screen.
The panel slides in over the top; the arrow at top-left slides it back out. Deep-linkable at
`#<month>/<view>/intel`.

## The four capabilities

**Multi-month trend** — any of the 15 SLAs across the full history, with the target line,
the amber tolerance band and the breach region drawn as shaded areas. The line entering the
band *is* the finding; you do not have to read a number to see it.

**Breach risk** — a ranked forecast for the month after the history ends. Two explainable
ingredients: the recent trend slope projected forward, and how far that projection sits from
the point where the metric formally breaches, measured in that metric's own tolerance units.
A metric comfortably inside target but falling fast can outrank one already amber but stable.
Every row shows its reasoning verbatim.

**Recurring failure points** — a driver (branch, queue, service, category) is compared against
its metric's own average for the same month. Consistently worse across several months means a
systemic weak spot rather than a bad month, and that distinction is the whole point. Cork and
Galway surface on underwriting TAT in every period.

**Executive insight** — a narrative that synthesises the three above into something a
governance lead reads in ten seconds.

## Bedrock, and what happens without it

The narrative has two layers, the same shape as the Phase 1 classifier:

| Layer | When | Notes |
|---|---|---|
| **Bedrock** | `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` set | Claude via `AnthropicBedrockMantle`, model from `BEDROCK_MODEL_ID` |
| **Rules** | otherwise, or on any API failure | Deterministic prose composed from the same computed figures |

Copy `.env.example` to `.env` and fill in the credentials. **The model is given the
arithmetic and asked to phrase it — it is never asked to work out what the numbers are.**
Every figure it can quote has already been calculated by the engine, and the system prompt
forbids stating anything not in its input.

Narratives are **cached on disk** keyed by a hash of the inputs, so a demo never depends on a
live call and a free-tier key cannot be throttled mid-presentation. Nothing on the page
breaks if Bedrock is unreachable — it silently falls back and labels which layer produced the
text.

## The six-month history

`npm run demo` builds April–August 2026; September is the live run. April, May and June are
Phase 2 backfill, tagged `provenance: "synthetic-backfill"` in the stored analysis (the UI
does not distinguish them). They are built through the *same* ingestion pipeline as every
other month, not written as fake JSON.

Four patterns run through the history so the intelligence layer has something real to find:

| Pattern | Where |
|---|---|
| Steady decline | complaint and escalation resolution climb every month → the breach prediction |
| Stable | endorsement TAT, STP accuracy, uptime → proof it is not crying wolf |
| Seasonal | contact centre load spikes in June and August → demand forecasting |
| Recurring cause | underwriting delay concentrated in Cork and Galway every month → clustering |

The branch skew is applied so the **monthly headline figure is unchanged** — only its
distribution across branches shifts. August underwriting TAT is exactly 3.20d either way;
Cork sits at 4.18d and Dublin at 2.50d underneath it.

## Phase 2 demo beat

Open **August 2026** → governance pack → click **Intelligence** bottom-right. It slides in,
the badge settles top-centre with its one-line brief, and the panel lands on All History:
escalation resolution has climbed every month and is projected past target again; Cork and
Galway are named as the recurring driver in 5 of 5 periods; the executive summary ties it
together. Narrow to a single month with the scope bar, then arrow back to governance.

---

## Not built yet

- **LLM cross-check on classification.** The structural classifier is the safe layer and
  runs offline. The intended second layer asks Claude the same question and derives the
  confidence badge from whether the two agree — high when they concur, low 70s when they
  do not, which is what earns the confirm/correct step its place on screen.
- **Learned formats.** Corrections are recorded but do not yet update the fingerprints.
- **Trend and prediction.** Phase 2, teased in the exceptions view.
