/**
 * ObservablePlotPage.jsx
 * -----------------------
 * Ten charts built with Observable Plot (@observablehq/plot 0.6.x).
 *
 * Observable Plot advantages highlighted here:
 *   - marks + transforms API: concise composable syntax (vs D3's imperative approach)
 *   - windowY: built-in rolling statistics transform applied inline on any mark
 *   - binX: automatic histogram binning with grouping, no manual bucket math
 *   - boxY: one-line 5-number summary box plot mark
 *   - hexbin: 2-D hexagonal density transform over 8,832 raw readings
 *   - waffleY: unique unit-based waffle chart mark not found in any other library here
 *   - fx/fy: faceted small multiples via a single channel declaration
 *   - tip: true: built-in hover tooltip on any mark, zero custom code
 *   - Plot.plot() returns a native SVG element; no wrapper library needed
 */

import { useEffect, useRef, useMemo } from "react"
import * as Plot from "@observablehq/plot"
import { useData } from "../DataContext"

/* ── colour palette (matches other pages) ──────────────────────── */
const MCOLS = { July: "#f97316", August: "#a855f7", September: "#06b6d4" }
const MONTH_ORDER = ["July", "August", "September"]
const RCOLS = { Drainage: "#34d399", Neutral: "#94a3b8", Backpressure: "#f87171" }
const REGIME_ORDER = ["Drainage", "Neutral", "Backpressure"]

const MONTH_COLOR_SCALE = {
  domain: MONTH_ORDER,
  range: [MCOLS.July, MCOLS.August, MCOLS.September],
}

/* ── helpers ────────────────────────────────────────────────────── */
function avg(arr) {
  if (!arr.length) return null
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

function buildDaily(records) {
  const map = new Map()
  for (const r of records) {
    if (!map.has(r.date)) map.set(r.date, [])
    map.get(r.date).push(r)
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, rows]) => {
      const dt = new Date(date + "T12:00:00")
      const m  = dt.getMonth() + 1
      const month = m === 7 ? "July" : m === 8 ? "August" : "September"
      const vTT = rows.map(r => r.temp_top_c).filter(v => v != null && v >= 15)
      const vCT = rows.map(r => r.conductance_top_us_cm).filter(v => v != null)
      const vSB = rows.map(r => r.salinity_bottom_ppt).filter(v => v != null)
      const vLv = rows.map(r => r.water_level_ft).filter(v => v != null)
      return {
        date, dt, month,
        rain:        Math.max(0, ...rows.map(r => r.rainfall_in ?? 0)),
        meanLevel:   vLv.length ? +avg(vLv).toFixed(3)  : null,
        meanTempTop: vTT.length ? +avg(vTT).toFixed(2)  : null,
        meanCondTop: vCT.length ? +avg(vCT).toFixed(1)  : null,
        meanSalBot:  vSB.length ? +avg(vSB).toFixed(3)  : null,
      }
    })
}

/* ── shared Plot options ─────────────────────────────────────────── */
const PL_STYLE = "background:#1e293b;color:#94a3b8;font-size:11px;overflow:visible;"

function mkOpts(opts) {
  return {
    style: PL_STYLE,
    marginLeft: 54,
    marginBottom: 38,
    marginTop: 22,
    marginRight: 22,
    ...opts,
  }
}

const gridY = () => Plot.gridY({ stroke: "#334155" })
const gridX = () => Plot.gridX({ stroke: "#334155" })

/* ── generic container that mounts a Plot SVG ────────────────────── */
function PlotBox({ make, deps, height = 340 }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current) return
    const w = ref.current.offsetWidth || 860
    const chart = make(w)
    if (!chart) return
    ref.current.innerHTML = ""
    ref.current.append(chart)
    return () => { if (ref.current) ref.current.innerHTML = "" }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div
      ref={ref}
      style={{ width: "100%", minHeight: height, background: "#1e293b", borderRadius: 8, overflow: "hidden" }}
    />
  )
}

/* ── page layout ─────────────────────────────────────────────────── */
const pageStyle = {
  fontFamily: "'Inter', sans-serif",
  color: "#e2e8f0",
  background: "#0f172a",
  minHeight: "100vh",
  padding: "24px 32px",
  maxWidth: 1100,
  margin: "0 auto",
}
const headingStyle = {
  fontSize: "1.1rem",
  fontWeight: 700,
  color: "#f8fafc",
  margin: "2rem 0 0.25rem",
  borderBottom: "1px solid #334155",
  paddingBottom: 6,
}
const descStyle = {
  fontSize: "0.82rem",
  color: "#94a3b8",
  margin: "0 0 0.75rem",
  lineHeight: 1.6,
}

/* ═══════════════════════════════════════════════════════════════════
   Main Page Component
   ═══════════════════════════════════════════════════════════════════ */
export default function ObservablePlotPage() {
  const { records, loading, error } = useData()

  /* ── data derivations (all before early returns) ─────────────── */
  const daily = useMemo(() => buildDaily(records), [records])

  const rawValid = useMemo(
    () => records.filter(r =>
      r.temp_top_c != null && r.temp_top_c >= 15 &&
      r.conductance_top_us_cm != null
    ),
    [records]
  )

  const regimeData = useMemo(() => {
    if (!daily.length) return { counts: [], props: [] }
    const K = 7
    const levels = daily.map(d => d.meanLevel)
    const rollMean = levels.map((_, i) => {
      const half = Math.floor(K / 2)
      const win  = levels
        .slice(Math.max(0, i - half), Math.min(levels.length, i + half + 1))
        .filter(v => v != null)
      return win.length ? avg(win) : null
    })
    const THRESH = 0.03
    const classified = daily.map((d, i) => ({
      ...d,
      regime:
        d.meanLevel == null || rollMean[i] == null ? "Neutral"
        : d.meanLevel > rollMean[i] + THRESH ? "Drainage"
        : d.meanLevel < rollMean[i] - THRESH ? "Backpressure"
        : "Neutral",
    }))
    const countMap = new Map()
    for (const d of classified) {
      const k = `${d.month}::${d.regime}`
      countMap.set(k, (countMap.get(k) ?? 0) + 1)
    }
    const counts = []
    for (const [k, count] of countMap) {
      const [month, regime] = k.split("::")
      counts.push({ month, regime, count })
    }
    const monthTotals = new Map()
    for (const r of counts) monthTotals.set(r.month, (monthTotals.get(r.month) ?? 0) + r.count)
    const props = counts.map(r => ({ ...r, proportion: r.count / monthTotals.get(r.month) }))
    return { counts, props }
  }, [daily])

  const stormDays = useMemo(
    () => daily.filter(d => d.rain >= 0.2).sort((a, b) => b.rain - a.rain).slice(0, 20),
    [daily]
  )

  const topAnnotations = useMemo(
    () => daily.filter(d => d.rain >= 0.5 && d.meanLevel != null)
               .sort((a, b) => b.rain - a.rain)
               .slice(0, 7),
    [daily]
  )

  if (loading) return <p style={{ color: "#94a3b8", padding: 32 }}>Loading data...</p>
  if (error)   return <p style={{ color: "#f87171", padding: 32 }}>Error: {error}</p>

  return (
    <div style={pageStyle}>
      <h1>Observable Plot</h1>
      <p>
        Full 3 months &middot; USGS site 2286328 &middot; Daily aggregates + raw 15-min records
      </p>
      <p style={{ ...descStyle, marginTop: "0.5rem" }}>
        Observable Plot is built by Observable (the team behind D3) as a higher-level library
        for exploratory visualization. Its API is a{" "}
        <strong style={{ color: "#f8fafc" }}>marks + transforms</strong> model: every visual
        element (<code>dot</code>, <code>line</code>, <code>bar</code>, <code>area</code>,{" "}
        <code>text</code>, <code>waffle</code>) is a mark composed with optional transforms
        (<code>windowY</code>, <code>binX</code>, <code>hexbin</code>,{" "}
        <code>normalizeY</code>, <code>stackY</code>) that reshape data before rendering.
        Unlike other libraries here, <code>Plot.plot()</code> returns a native SVG element
        from a plain function with no component lifecycle or plugin registry. Any mark can
        show a formatted hover tooltip by adding <code>tip: true</code>, and{" "}
        <code>fx</code> / <code>fy</code> channels add faceted small multiples to any chart
        type in a single channel declaration.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", margin: "0.75rem 0 1.5rem", fontSize: "0.82rem" }}>
        <div>
          <div style={{ color: "#34d399", fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Strengths</div>
          <ul style={{ margin: 0, paddingLeft: "1.15rem", color: "#94a3b8", lineHeight: 1.5 }}>
            <li>Built-in <code>windowY</code>, <code>binX</code>, <code>hexbin</code> transforms applied inline on any mark</li>
            <li><code>tip: true</code> on any mark adds rich formatted hover tooltips with zero custom code</li>
            <li><code>fx</code> / <code>fy</code> channels facet any chart into small multiples in one declaration</li>
            <li><code>Plot.waffleY</code> is a unique mark type not available in any other library here</li>
            <li>Returns a native SVG element from a plain function call; no React wrapper required</li>
          </ul>
        </div>
        <div>
          <div style={{ color: "#f87171", fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Limitations</div>
          <ul style={{ margin: 0, paddingLeft: "1.15rem", color: "#94a3b8", lineHeight: 1.5 }}>
            <li>No built-in animation or transition system</li>
            <li>No 3-D, geographic, or hierarchical chart types (treemap, sunburst)</li>
            <li>Smaller community than D3 or Chart.js; fewer tutorials, plugins, and examples</li>
            <li>API evolves across 0.x minor versions with occasional breaking changes</li>
          </ul>
        </div>
      </div>

      {/* 1. Line + windowY rolling mean ─────────────────────────────── */}
      <h2 style={headingStyle}>1. Line + windowY: Water Level with 7-Day Rolling Mean</h2>
      <p style={descStyle}>
        The grey line plots raw daily mean water level. The cyan line applies{" "}
        <code>Plot.windowY(7, ...)</code>, a built-in rolling statistics transform, to the
        same dataset before rendering. No precomputation code is required; the transform
        runs inside Plot's mark pipeline and replaces the <code>y</code> channel values
        with their 7-day centred window mean. Orange vertical rules mark storm days
        (rainfall at least 0.5 in) added as a third mark from a filtered copy of the same
        array. Compare this to EChartsPage chart 1 where the same data-zoom is built from
        raw 8,832 readings; here the cleaning is declarative.
      </p>
      <PlotBox
        deps={[daily]}
        height={290}
        make={(w) => {
          const hasLevel = daily.filter(d => d.meanLevel != null)
          const storms   = daily.filter(d => d.rain >= 0.5)
          return Plot.plot(mkOpts({
            width: w, height: 260,
            x: { type: "time", label: "Date" },
            y: { label: "Water level (ft)" },
            marks: [
              gridY(),
              Plot.ruleX(storms, { x: "dt", stroke: "#f97316", strokeOpacity: 0.45, strokeWidth: 1 }),
              Plot.lineY(hasLevel, { x: "dt", y: "meanLevel", stroke: "#475569", strokeWidth: 1 }),
              Plot.lineY(hasLevel, Plot.windowY(7, { x: "dt", y: "meanLevel", stroke: "#38bdf8", strokeWidth: 2 })),
              Plot.text([{ dt: hasLevel[3]?.dt, meanLevel: hasLevel[3]?.meanLevel }],
                { x: "dt", y: "meanLevel", text: () => "raw", dy: -8, fill: "#64748b", fontSize: 9 }),
            ],
          }))
        }}
      />

      {/* 2. binX histogram ─────────────────────────────────────────── */}
      <h2 style={headingStyle}>2. binX Transform: Conductance Frequency Distribution by Month</h2>
      <p style={descStyle}>
        <code>{"Plot.binX({ y: \"count\" }, { x: \"meanCondTop\", thresholds: 15 })"}</code>{" "}
        automatically divides the x range into equal-width buckets and counts observations
        per bucket without any manual bucket math. Three separate calls (one per month)
        produce overlapping translucent distributions. The horizontal shift from July
        (orange) toward September (cyan) reflects the seasonal increase in salinity as
        monsoon-flushed freshwater recedes and tidal intrusion intensifies. Unlike
        Google Charts' Histogram (one colour per series), here all three are
        simultaneously comparable in the same axis space.
      </p>
      <PlotBox
        deps={[daily]}
        height={290}
        make={(w) => {
          const condData = daily.filter(d => d.meanCondTop != null)
          return Plot.plot(mkOpts({
            width: w, height: 260,
            x: { label: "Daily mean surface conductance (µS/cm)" },
            y: { label: "Days" },
            marks: [
              gridY(),
              ...MONTH_ORDER.map(m =>
                Plot.rectY(
                  condData.filter(d => d.month === m),
                  Plot.binX({ y: "count" }, { x: "meanCondTop", fill: MCOLS[m], fillOpacity: 0.55, thresholds: 15, rx: 1 })
                )
              ),
              Plot.ruleY([0]),
            ],
          }))
        }}
      />

      {/* 3. Dot with built-in tip ──────────────────────────────────── */}
      <h2 style={headingStyle}>3. Dot with tip: Temperature vs Salinity (Built-in Tooltip)</h2>
      <p style={descStyle}>
        Adding <code>tip: true</code> to any Observable Plot mark renders a formatted hover
        tooltip showing all channel values for the nearest point (date, both axis values,
        and the fill group) with no custom tooltip function required. In Chart.js this
        requires a <code>tooltip.callbacks.label</code> function; in Recharts a full custom
        component; in D3 manual SVG or HTML overlay positioning. Here it is a single
        property on the <code>dot</code> mark. The seasonal stratification pattern
        (September points trending higher on both axes) is visible in the colour clustering.
      </p>
      <PlotBox
        deps={[daily]}
        height={320}
        make={(w) => {
          const scatterData = daily.filter(d => d.meanTempTop != null && d.meanSalBot != null)
          return Plot.plot(mkOpts({
            width: w, height: 290,
            x: { label: "Surface temperature (°C)" },
            y: { label: "Bottom salinity (ppt)" },
            color: MONTH_COLOR_SCALE,
            marks: [
              gridX(),
              gridY(),
              Plot.dot(scatterData, {
                x: "meanTempTop",
                y: "meanSalBot",
                fill: "month",
                r: 4,
                fillOpacity: 0.85,
                tip: true,
              }),
            ],
          }))
        }}
      />

      {/* 4. boxY ───────────────────────────────────────────────────── */}
      <h2 style={headingStyle}>4. boxY: Monthly Water Level Distribution</h2>
      <p style={descStyle}>
        <code>{"Plot.boxY(data, { x: \"month\", y: \"meanLevel\", fill: \"month\" })"}</code>{" "}
        produces a full Tukey box plot (whiskers at 1.5 times the IQR, box spanning the
        interquartile range, median line, and outlier circles) from a single function call.
        Plot computes the 5-number summary internally with no external statistics library.
        Achieving the same in Chart.js requires a third-party plugin; in D3 or Recharts the
        quartiles must be computed manually and each SVG element drawn separately. September
        shows a compressed IQR with more outliers on the high side, indicating flash
        rainfall events pulling the mean up above a stable baseline.
      </p>
      <PlotBox
        deps={[daily]}
        height={300}
        make={(w) => {
          const levelData = daily.filter(d => d.meanLevel != null)
          return Plot.plot(mkOpts({
            width: w, height: 270,
            x: { domain: MONTH_ORDER, label: "Month" },
            y: { label: "Daily mean water level (ft)" },
            color: MONTH_COLOR_SCALE,
            marks: [
              gridY(),
              Plot.boxY(levelData, { x: "month", y: "meanLevel", fill: "month", fillOpacity: 0.7 }),
            ],
          }))
        }}
      />

      {/* 5. hexbin density ─────────────────────────────────────────── */}
      <h2 style={headingStyle}>5. hexbin: Temperature vs Conductance Density (8,832 Readings)</h2>
      <p style={descStyle}>
        All 8,832 raw 15-minute readings are passed directly to{" "}
        <code>{"Plot.hexbin({ fill: \"count\" }, { binWidth: 22 })"}</code>. The transform
        partitions the 2-D plane into a hexagonal lattice and counts observations per cell,
        then colours each cell by count through an Inferno scale. Compared to Plotly's KDE
        density contour (chart 5 on the Plotly page), hexbin is non-parametric and
        exact: no smoothing bandwidth to choose and the cell boundaries are uniform.
        The dense cluster at 30-33 C / 500-1500 µS/cm is the canal's normal summer
        operating range; the high-conductance tail extending upward captures saltwater
        intrusion events.
      </p>
      <PlotBox
        deps={[rawValid]}
        height={320}
        make={(w) => {
          return Plot.plot(mkOpts({
            width: w, height: 290,
            x: { label: "Surface temperature (°C)" },
            y: { label: "Surface conductance (µS/cm)" },
            color: { type: "sequential", scheme: "Inferno", label: "Readings per hex cell", legend: true },
            marks: [
              gridX(),
              gridY(),
              Plot.dot(
                rawValid,
                Plot.hexbin(
                  { fill: "count" },
                  { x: "temp_top_c", y: "conductance_top_us_cm", binWidth: 22 }
                )
              ),
            ],
          }))
        }}
      />

      {/* 6. waffleY ────────────────────────────────────────────────── */}
      <h2 style={headingStyle}>6. waffleY: Flow Regime Days per Month</h2>
      <p style={descStyle}>
        <code>Plot.waffleY</code> is a mark type unique to Observable Plot. Each unit square
        represents one day. Days are classified by flow regime: Drainage (canal water level
        above the 7-day rolling mean by more than 0.03 ft), Backpressure (below by that
        margin), or Neutral otherwise. The squares are stacked and coloured by regime.
        Unlike a bar chart, the individual squares are countable by eye: the exact number
        of drainage days visible in July versus August can be read directly from the grid.
        No other library surveyed here has a native waffle mark; achieving the same in D3
        requires manual rectangle-grid positioning code.
      </p>
      <PlotBox
        deps={[regimeData.counts]}
        height={240}
        make={(w) => {
          return Plot.plot(mkOpts({
            width: w, height: 210,
            x: { domain: MONTH_ORDER, label: "Month" },
            y: { label: "Days" },
            color: { domain: REGIME_ORDER, range: REGIME_ORDER.map(r => RCOLS[r]) },
            marks: [
              Plot.waffleY(regimeData.counts, {
                x: "month",
                y: "count",
                fill: "regime",
                unit: 1,
                gap: 1.5,
              }),
              Plot.ruleY([0]),
            ],
          }))
        }}
      />

      {/* 7. fx faceted small multiples ─────────────────────────────── */}
      <h2 style={headingStyle}>7. fx Facets: Monthly Salinity Profiles as Small Multiples</h2>
      <p style={descStyle}>
        Adding <code>fx: "month"</code> to both the area and line marks tells Observable
        Plot to split the data into one panel per unique month value and render them side
        by side on a shared y scale. No layout code is needed. In D3 this requires manually
        computing sub-SVG transforms and translated groups for each panel; in Recharts it
        requires separate component instances with workarounds to keep axes aligned. The
        seasonal progression is clear: July salinity stays near zero throughout; August
        shows occasional spikes; September exhibits a sustained elevated baseline as
        tidal exchange intensifies.
      </p>
      <PlotBox
        deps={[daily]}
        height={230}
        make={(w) => {
          const salData = daily.filter(d => d.meanSalBot != null)
          return Plot.plot(mkOpts({
            width: w, height: 200,
            marginLeft: 46,
            x: { type: "time", label: "" },
            y: { label: "Bottom salinity (ppt)" },
            color: MONTH_COLOR_SCALE,
            fx: { label: null },
            marks: [
              gridY(),
              Plot.areaY(salData, {
                x: "dt", y: "meanSalBot", fx: "month",
                fill: "month", fillOpacity: 0.3,
                curve: "monotone-x",
              }),
              Plot.lineY(salData, {
                x: "dt", y: "meanSalBot", fx: "month",
                stroke: "month", strokeWidth: 1.5,
                curve: "monotone-x",
              }),
            ],
          }))
        }}
      />

      {/* 8. stackY + normalised bar ────────────────────────────────── */}
      <h2 style={headingStyle}>8. stackY: Normalised Flow Regime Proportions per Month</h2>
      <p style={descStyle}>
        <code>Plot.stackY</code> takes records sharing the same <code>x</code> value (month)
        and stacks their <code>y</code> channels cumulatively, generating{" "}
        <code>y1</code> and <code>y2</code> for each bar segment. The proportions are
        pre-normalised per month (each column sums to 1.0), equivalent to applying{" "}
        <code>{"Plot.normalizeY(\"sum\", ...)"}</code> inline. Regime order is fixed by
        passing an array to the <code>order</code> option of <code>stackY</code>.
        September's relatively larger Backpressure fraction (red) reflects more frequent
        tidal intrusion events as the dry season transitions in.
      </p>
      <PlotBox
        deps={[regimeData.props]}
        height={300}
        make={(w) => {
          return Plot.plot(mkOpts({
            width: w, height: 270,
            x: { domain: MONTH_ORDER, label: "Month" },
            y: { label: "Proportion", tickFormat: "%", domain: [0, 1] },
            color: { domain: REGIME_ORDER, range: REGIME_ORDER.map(r => RCOLS[r]) },
            marks: [
              gridY(),
              Plot.barY(regimeData.props,
                Plot.stackY({
                  order: REGIME_ORDER,
                  x: "month",
                  y: "proportion",
                  fill: "regime",
                })
              ),
              Plot.ruleY([0, 1]),
            ],
          }))
        }}
      />

      {/* 9. ruleX + dot lollipop ───────────────────────────────────── */}
      <h2 style={headingStyle}>9. ruleX + dot: Rainfall Lollipop (Top 20 Storm Days)</h2>
      <p style={descStyle}>
        A lollipop chart composes two marks: <code>Plot.ruleX</code> draws a vertical stem
        from <code>y1 = 0</code> to <code>y2 = rain</code>, and <code>Plot.dot</code> places
        a circle cap at the tip. Both marks share the same data and the same{" "}
        <code>x: "dt"</code> channel, so they align automatically. Adding{" "}
        <code>tip: true</code> to the dot gives each event a hover card with no extra code.
        In Recharts the equivalent requires a <code>ComposedChart</code> combining{" "}
        <code>Bar</code> and <code>Line</code> with custom cell rendering; in D3 separate
        line and circle selections with coordinate math. Observable Plot composes both marks
        from the same data object in two lines.
      </p>
      <PlotBox
        deps={[stormDays]}
        height={300}
        make={(w) => {
          return Plot.plot(mkOpts({
            width: w, height: 270,
            x: { type: "time", label: "Date" },
            y: { label: "Daily rainfall (in)" },
            color: MONTH_COLOR_SCALE,
            marks: [
              gridY(),
              Plot.ruleY([0]),
              Plot.ruleX(stormDays, { x: "dt", y1: 0, y2: "rain", stroke: "month", strokeWidth: 1.5 }),
              Plot.dot(stormDays, { x: "dt", y: "rain", fill: "month", r: 5, tip: true }),
            ],
          }))
        }}
      />

      {/* 10. text mark annotations ─────────────────────────────────── */}
      <h2 style={headingStyle}>10. text mark: Annotated Water Level Time Series</h2>
      <p style={descStyle}>
        <code>Plot.text</code> places a label at the data coordinate of each record. Three
        marks compose the chart: a background water-level line (all days), an orange dot on
        each of the top-7 storm events, and a <code>text</code> mark with{" "}
        <code>dy: -12</code> offsetting each label 12 pixels above its anchor dot. The text
        content is a function accessor (<code>d =&gt; d.rain.toFixed(2) + '"'</code>), which
        Observable Plot evaluates uniformly with field-name strings and constant values
        across all mark channels. No SVG <code>&lt;text&gt;</code> append calls or
        useEffect coordinate lookups are needed. In D3 and Plotly, annotation positioning
        requires explicit coordinate calculations; in Chart.js, plugin code.
      </p>
      <PlotBox
        deps={[daily, topAnnotations]}
        height={300}
        make={(w) => {
          const hasLevel = daily.filter(d => d.meanLevel != null)
          return Plot.plot(mkOpts({
            width: w, height: 270,
            x: { type: "time", label: "Date" },
            y: { label: "Water level (ft)" },
            marks: [
              gridY(),
              Plot.lineY(hasLevel, { x: "dt", y: "meanLevel", stroke: "#475569", strokeWidth: 1.2 }),
              Plot.dot(topAnnotations, { x: "dt", y: "meanLevel", fill: "#f97316", r: 5 }),
              Plot.text(topAnnotations, {
                x: "dt",
                y: "meanLevel",
                text: d => `${d.rain.toFixed(2)}"`,
                dy: -12,
                fill: "#f97316",
                fontSize: 10,
                fontWeight: "600",
              }),
            ],
          }))
        }}
      />
    </div>
  )
}
