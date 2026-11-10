# PLUVIA — Make room for the rain

## Tagline

Turn a neighborhood into a sponge. Simulate storms, design interventions, and measure resilience — one reproducible experiment at a time.

## Inspiration

Stormwater infrastructure is usually invisible until it fails. Students and communities are often asked to care about climate resilience without being given a way to explore the tradeoffs. We wanted to make that question tangible: what happens if this patch of pavement becomes permeable, or this piece of ground becomes a rain garden?

PLUVIA makes a synthetic neighborhood into a hands-on experiment. The point is not to promise an effortless solution to flooding. It is to help people ask better questions and compare possible answers with transparent, reproducible evidence.

## What it does

Choose a storm, adjust its duration and soil condition, then watch water move over terrain in a custom isometric city. Place rain gardens, permeable paving and retention basins with real effects inside the model. Every intervention has compatible land cover, finite storage, infiltration behavior and an illustrative cost.

Every design is compared with a paired baseline using identical terrain and rainfall. Scrub the hydrograph, inspect water depth tile by tile, and see whether the model's school-to-community-center route remains available. A* excludes building and river cells and blocks water deeper than 15 cm.

The budget optimizer reruns full storms for candidate interventions and accepts measured improvement per dollar. The accepted sequence becomes an investment/performance frontier that can be restored point by point. A cross-storm test challenges the same design under a cloudburst, long monsoon and extreme downpour.

Open the water ledger to account for every modeled drop. Export a reproducible JSON plan, share a scenario URL, import elevation CSV, or download the full water-budget time series. A built-in visual report and narrated demo exporter render the actual simulation canvases locally.

## How we built it

PLUVIA is a static application with no runtime JavaScript dependencies or backend requirements. ES modules separate the numerical engine, Web Worker computation, interaction, renderer and media export. Canvas 2D draws the city, vegetation, water overlays and hydrograph from original geometry.

The model uses a 48 × 40 grid of 8 m cells with a 10-second time step. Rainfall reaches all cells; roof runoff is redirected to ground. A land-cover-dependent infiltration term and finite intervention storage compete with surface runoff. Sewer inlets and a free-draining river are explicit, tracked sinks. Pairwise finite-volume face exchange uses water-surface elevation and a Manning-inspired discharge law. A head-difference cap and donor limiting avoid negative water and alternating-cell numerical artifacts.

The optimizer ranks wet locations, spatially diversifies candidates, and measures the change in a weighted peak-volume / flooded-area objective by rerunning each trial. Search is greedy, budget-constrained and explicitly described as a heuristic, not a global optimum. Web Workers keep this computation away from the interface.

## Challenges we ran into

Conservation alone did not guarantee a useful-looking simulation. An early explicit flow step produced alternating wet and dry cells. Capping face transfer relative to head difference made the stencil monotone while preserving the water ledger.

We also had to distinguish model-derived evidence from plausible-looking scores. Baseline and design share one engine and identical inputs; exported plans reproduce the parameters; the ledger exposes the residual. We chose to present modest measured effects rather than inflate the impact.

## Accomplishments

The included Riverside retrofit uses 34 interventions and $176,500 of an illustrative $180,000 budget. In its 90 mm/h, 60-minute cloudburst, modeled peak surface water changes from approximately 7,951 to 7,612 m³, a 4.3% reduction. Peak inundated area above 10 cm changes from 28,736 to 27,584 m². The same plan yields approximately 6.0% peak-volume reduction in the long monsoon and 2.8% in the extreme downpour. These are synthetic model results, not claims about a real city.

Automated tests cover no-rain behavior, integrated rainfall input, water-ledger closure below 1e-6 m³, nonnegative finite depths, route exclusions, invalid/budget-incompatible placements, and measured optimizer improvement within budget. Browser checks exercised optimization, counterfactual comparison, multi-storm tests, timeline-dependent access, manual placement, budget rejection, undo and exports.

## What we learned

Transparency is a technical feature. A model that reveals its assumptions, accounting and limits can teach more than a dramatic risk score. We also learned why a physically conservative model still needs numerical stability checks, and why recommendations become more meaningful when every candidate must survive a rerun of the same experiment.

## What's next

Calibrated real-world catchments, observed rainfall and surveyed terrain; a subsurface sewer network and backwater; sensitivity and uncertainty analysis; larger-scale solver validation; and community co-design workshops. These are future work, not features claimed by this prototype.

## Model limits and credits

PLUVIA is an educational prototype, not a calibrated flood forecast, engineering design tool or real-world navigation service. The neighborhood, elevations, costs and hydrological parameters are illustrative. The outer boundary is closed, the river drains freely, and subsurface networks and backwater are not modeled.

Conceptual hydrology reference: US EPA SWMM documentation, https://www.epa.gov/water-research/storm-water-management-model-swmm. PLUVIA uses an independently authored simplified engine, not SWMM. Typography: DM Sans and DM Serif Display (Google Fonts, SIL Open Font License). All city graphics are code-drawn geometry. Comparative research included the public description of HydroGrid from a different hackathon; its code and assets were not reused.

**AI disclosure:** OpenAI Codex was used extensively for ideation, architecture, visual design, numerical code, tests, documentation and submission preparation. Significant portions of the code and writing were AI-generated. There is no runtime AI model; optimization is deterministic numerical search. Demo narration is synthetic text-to-speech. Participants are responsible for understanding, verifying and demonstrating their submission.

## Built with

JavaScript, HTML, CSS, Canvas 2D, Web Workers, MediaRecorder, Web Audio API, finite-volume modeling, A* search, simulation-based optimization, Node.js tests, OpenAI Codex.

## Tracks

Best Design & UX; Best Deployed / Shipped App; Best AI Hack (AI-assisted development, transparently disclosed). No hardware claim; no first-hack claim.
