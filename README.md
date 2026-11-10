# PLUVIA · Make room for the rain.

A browser-native urban stormwater design lab, developed from scratch during IceHacks 2026. Design a synthetic neighborhood, run a storm, and compare the consequences against the exact same city's baseline.

## Run

Node 22+ is needed for tests; Python 3 serves the static app. The numerical engine has no runtime dependencies. Three.js 0.187.0 and OrbitControls power the real-time 3D view and are bundled locally in `dist/vendor/`. Serving the included static files needs no installation, API keys, accounts or database.

```sh
npm run dev
# http://localhost:8791
npm test
npm run check
```

To host elsewhere, serve `dist/` over HTTP(S). ES-module Web Workers require an HTTP origin. Google Fonts are optional presentation assets with system fallbacks; all application code runs locally in the visitor's browser. The 3D renderer loads from this same static site, without a renderer CDN. To work with the pinned source dependency, run `npm ci`.

## What you can do

- Configure a pulsed cloudburst, steady monsoon or extreme downpour; adjust mean rainfall, duration and soil condition.
- Explore a 48 × 40 cell, 384 × 320 m synthetic catchment in true WebGL 3D: orbit, pan and zoom around volumetric buildings, trees, interventions and water surfaces.
- Use shadowed lighting and raycast tile picking, or switch to the original Canvas 2D plan; a 2D fallback remains available if WebGL cannot initialize.
- Place rain gardens, permeable paving and retention basins, subject to compatible land cover and an illustrative budget.
- Run paired baseline/design simulations in a module Web Worker. Scrub the resulting hydrograph and spatial frames.
- Use simulation-in-the-loop greedy optimization: diversify wet-site candidates, simulate each proposal, accept improvement per dollar, and keep an investment/performance frontier.
- View an A* route between school and community center that excludes water deeper than 15 cm.
- Stress-test one plan against three storms.
- Inspect the full water ledger, export time-series CSV and plan JSON, restore plans, and share reproducible scenarios in a URL.
- Import a 48-column × 40-row elevation CSV in meters while keeping the synthetic land cover.
- Use keyboard placement, reduced-motion rendering, responsive layouts and locally saved state.

## Model

`dist/engine.js` is a dependency-free JavaScript numerical core shared by the worker and Node tests. The main thread in `dist/app.js` owns interaction; `dist/city3d.js` renders the actual depth frames using Three.js, while Canvas 2D supplies the alternate plan and hydrograph. `dist/worker.js` owns long computations. Changing the viewing angle does not change the hydrological inputs or results.

Every 10-second step:

1. Apply rainfall over all cells; redirect roof runoff to the nearest non-building cell.
2. Infiltrate water at a land-cover-dependent rate. Interventions provide enhanced infiltration and finite subsurface storage. Saturation multiplies infiltration rate.
3. Remove and account for free-draining river water and localized sewer-inlet outflow.
4. Exchange surface water through shared grid faces using head differences and a Manning-inspired discharge law. A head-difference cap limits the explicit diffusion stencil; donor limiting guarantees nonnegative water depths.
5. Track surface water, intervention storage, infiltration, outflow, inundated area and maxima.

The ledger is `rainfall = surface + storage + infiltration + outflow + residual`. Tests check residual below 1e-6 m³ for several storms, nonnegative depths, no rainfall/no water, correct pulse-integrated rainfall, route constraints, malformed placement rejection, and optimizer improvement within budget.

The optimizer minimizes `peak surface volume + 0.035 × peak flooded area` and scores marginal improvement per illustrative dollar. It searches up to six spatially diversified candidates per iteration, accepting at most 48 interventions per run. It is a greedy heuristic, not a global optimum. Rerunning starts from the current design.

## Honest boundaries

This is an **educational prototype**, not a calibrated flood forecast, drainage engineering tool or real-world navigation service. City geometry and elevations are synthetic. All infiltration rates, reservoirs, inlet capacities and dollar costs are illustrative. The outer grid boundary is closed; river cells drain freely. Subsurface networks, backwater, sewer surcharging, erosion, recovery of soil infiltration and real-world validation are outside this prototype. Numerical conservation verifies accounting, not predictive validity. Terrain relief and water height are visually enhanced to make spatial relationships legible; the displayed scene is not a survey-scale reconstruction. Solver values and exported water volumes use the model's original units.

The model takes conceptual inspiration from the hydrology and green-infrastructure processes described by the [US EPA's SWMM documentation](https://www.epa.gov/water-research/storm-water-management-model-swmm). It does not execute, reimplement or claim equivalence with SWMM.

## Originality and credits

No application code was reused from an existing project. Comparative research included the public description of [HydroGrid](https://devpost.com/software/hydrogrid-interactive-sponge-city-simulator), a project from a different hackathon. PLUVIA's code, visual system and implementation were authored independently; its particular focus is reproducible counterfactuals, explicit water accounting, terrain-dependent flow, measured budget search, cross-storm tests and water-aware network access. IceHacks' own gallery was not yet published when researched.

3D rendering: [Three.js 0.187.0](https://threejs.org/) and its OrbitControls addon, MIT licensed. Bundled runtime files and the upstream license are in `dist/vendor/`; see `dist/vendor/LICENSE-three.txt`.

Typography: DM Sans and DM Serif Display, served by Google Fonts under the SIL Open Font License; system fallbacks are provided. The city, vegetation, icon and diagrams are original code-drawn geometry. Optional demo narration uses system text-to-speech and is identified as synthetic narration.

**AI disclosure:** OpenAI Codex was used extensively for product ideation, architecture, interface design, numerical implementation, tests, documentation and submission preparation. Significant portions of this project's code and prose were AI-generated. No runtime AI model is used; the optimizer is deterministic numerical search. Participants remain responsible for understanding, verifying and presenting the work. This disclosure must accompany the hackathon submission.

## Files

- `dist/index.html`, `dist/style.css`: interface and responsive visual system
- `dist/app.js`: interaction, 2D plan, charts, import/export, report UI
- `dist/city3d.js`: Three.js scene, camera controls, shadows, water surfaces and raycast picking
- `dist/vendor/`: locally bundled Three.js, OrbitControls and upstream MIT license
- `dist/engine.js`: deterministic hydrology, A* and optimizer
- `dist/worker.js`: background computation protocol
- `tests/engine.test.js`: physical/accounting and algorithmic invariants
- `submission/`: submission copy, explanation and demo production material

MIT licensed. See `LICENSE`.
