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

## Not built yet

- **LLM cross-check on classification.** The structural classifier is the safe layer and
  runs offline. The intended second layer asks Claude the same question and derives the
  confidence badge from whether the two agree — high when they concur, low 70s when they
  do not, which is what earns the confirm/correct step its place on screen.
- **Learned formats.** Corrections are recorded but do not yet update the fingerprints.
- **Trend and prediction.** Phase 2, teased in the exceptions view.
