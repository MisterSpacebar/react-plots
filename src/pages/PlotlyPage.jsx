/**
 * PlotlyPage.jsx
 * ---------------
 * Eight charts built with Plotly.js (plotly.js-dist-min) via imperative
 * Plotly.newPlot() calls inside useRef / useEffect hooks: the same
 * pattern used for D3 but with Plotly's high-level trace API.
 *
 * Plotly advantages highlighted here:
 *   - Built-in interactive toolbar (zoom, pan, lasso select, hover, download PNG)
 *     on EVERY chart with zero configuration
 *   - True 3-D WebGL scatter (scatter3d): not possible in Chart.js or Recharts
 *   - Parallel coordinates (parcoords) with multi-axis brush/filter
 *   - Native violin + box hybrid in a single trace type
 *   - 2-D density contour with automatic KDE: no math code needed
 *   - Waterfall chart (cumulative deltas): a first-class trace type
 *   - Indicator / gauge KPI tiles
 *   - Sankey flow diagram from named nodes
 */

import { useEffect, useRef } from "react"
import Plotly from "plotly.js-dist-min"
import { useData } from "../DataContext"

/* ─── shared data helpers ───────────────────────────────────────── */
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
      const monthNum = new Date(date + "T12:00:00").getMonth() + 1
      const monthName = monthNum === 7 ? "July" : monthNum === 8 ? "August" : "September"
      const vTT = rows.map(r => r.temp_top_c).filter(v => v != null && v >= 15)
      const vTB = rows.map(r => r.temp_bottom_c).filter(v => v != null && v >= 15)
      const vSB = rows.map(r => r.salinity_bottom_ppt).filter(v => v != null)
      const vCT = rows.map(r => r.conductance_top_us_cm).filter(v => v != null)
      const vLv = rows.map(r => r.water_level_ft).filter(v => v != null)
      return {
        date,
        monthName,
        maxRain: Math.max(0, ...rows.map(r => r.rainfall_in ?? 0)),
        meanLevel:    vLv.length  ? +avg(vLv).toFixed(3)  : null,
        meanTempTop:  vTT.length  ? +avg(vTT).toFixed(2)  : null,
        meanTempBot:  vTB.length  ? +avg(vTB).toFixed(2)  : null,
        meanSalBot:   vSB.length  ? +avg(vSB).toFixed(3)  : null,
        meanCondTop:  vCT.length  ? +avg(vCT).toFixed(0)  : null,
      }
    })
}

/* ─── Plotly dark theme shared layout fragments ──────────────────── */
const DARK = {
  paper_bgcolor: "#1e293b",
  plot_bgcolor:  "#1e293b",
  font: { color: "#e2e8f0", size: 11 },
  xaxis: { gridcolor: "#334155", zerolinecolor: "#475569", tickfont: { color: "#94a3b8" } },
  yaxis: { gridcolor: "#334155", zerolinecolor: "#475569", tickfont: { color: "#94a3b8" } },
  legend: { bgcolor: "rgba(30,41,59,0.85)", bordercolor: "#334155", borderwidth: 1 },
  margin: { t: 36, r: 20, b: 44, l: 60 },
}

const CONFIG = {
  responsive: true,
  displaylogo: false,
  modeBarButtonsToRemove: ["select2d", "lasso2d", "toggleSpikelines"],
}

const MONTH_COLORS = { July: "#f97316", August: "#a855f7", September: "#06b6d4" }

/* ─── tiny wrapper: render Plotly into a div ─────────────────────── */
function PlotBox({ id, traces, layout, config, height = 340 }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current) return
    Plotly.newPlot(ref.current, traces, layout, config ?? CONFIG)
    return () => Plotly.purge(ref.current)
  }, [traces, layout, config])
  return <div ref={ref} style={{ width: "100%", height }} />
}

/* ─── page styles ────────────────────────────────────────────────── */
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
const boxStyle = {
  background: "#1e293b",
  borderRadius: 8,
  overflow: "hidden",
  marginBottom: "0.5rem",
}

/* ═══════════════════════════════════════════════════════════════════
   Page
   ═══════════════════════════════════════════════════════════════════ */
export default function PlotlyPage() {
  const { records, loading, error } = useData()

  if (loading) return <p style={{ color: "#94a3b8", padding: 32 }}>Loading data...</p>
  if (error)   return <p style={{ color: "#f87171", padding: 32 }}>Error: {error.message}</p>

  const daily = buildDaily(records)
  const months = ["July", "August", "September"]

  /* ── 1. Scatter with manual OLS trendlines ── */
  const scatterTraces = months.flatMap(m => {
    const pts = daily.filter(d => d.monthName === m && d.meanTempTop != null && d.meanSalBot != null)
    const xs = pts.map(d => d.meanTempTop)
    const ys = pts.map(d => d.meanSalBot)
    // OLS
    const n = xs.length
    const mx = xs.reduce((a, b) => a + b, 0) / n
    const my = ys.reduce((a, b) => a + b, 0) / n
    const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) /
                  xs.reduce((s, x) => s + (x - mx) ** 2, 0)
    const intercept = my - slope * mx
    const xRange = [Math.min(...xs), Math.max(...xs)]
    return [
      {
        type: "scatter", mode: "markers", name: m,
        x: xs, y: ys,
        marker: { color: MONTH_COLORS[m], size: 7, opacity: 0.75, line: { color: "#0f172a", width: 0.5 } },
        text: pts.map(d => `${d.date}<br>Temp: ${d.meanTempTop} C<br>Sal: ${d.meanSalBot} ppt`),
        hoverinfo: "text",
        legendgroup: m,
      },
      {
        type: "scatter", mode: "lines", name: `${m} trend`,
        x: xRange, y: xRange.map(x => slope * x + intercept),
        line: { color: MONTH_COLORS[m], width: 1.5, dash: "dot" },
        showlegend: false, hoverinfo: "none",
        legendgroup: m,
      },
    ]
  })
  const scatterLayout = {
    ...DARK,
    title: { text: "", font: { size: 0 } },
    xaxis: { ...DARK.xaxis, title: { text: "Daily Mean Temp Top (C)", font: { color: "#64748b" } } },
    yaxis: { ...DARK.yaxis, title: { text: "Salinity Bottom (ppt)", font: { color: "#64748b" } } },
  }

  /* ── 2. 3-D Scatter (scatter3d) ── */
  const scatter3dTraces = months.map(m => {
    const pts = daily.filter(d =>
      d.monthName === m &&
      d.meanTempTop != null && d.meanTempBot != null && d.meanLevel != null
    )
    return {
      type: "scatter3d", mode: "markers", name: m,
      x: pts.map(d => d.meanTempTop),
      y: pts.map(d => d.meanTempBot),
      z: pts.map(d => d.meanLevel),
      text: pts.map(d => `${d.date}`),
      marker: { color: MONTH_COLORS[m], size: 4, opacity: 0.85, line: { color: "#0f172a", width: 0.3 } },
      hovertemplate: "%{text}<br>TempTop: %{x:.2f} C<br>TempBot: %{y:.2f} C<br>Level: %{z:.3f} ft<extra></extra>",
    }
  })
  const scatter3dLayout = {
    ...DARK,
    scene: {
      bgcolor: "#1e293b",
      xaxis: { title: { text: "Temp Top (C)" }, gridcolor: "#334155", tickfont: { color: "#94a3b8" } },
      yaxis: { title: { text: "Temp Bottom (C)" }, gridcolor: "#334155", tickfont: { color: "#94a3b8" } },
      zaxis: { title: { text: "Water Level (ft)" }, gridcolor: "#334155", tickfont: { color: "#94a3b8" } },
      camera: { eye: { x: 1.6, y: 1.6, z: 0.8 } },
    },
    margin: { t: 10, r: 0, b: 0, l: 0 },
  }

  /* ── 3. Parallel Coordinates ── */
  const validDaily = daily.filter(d =>
    d.meanLevel != null && d.meanTempTop != null &&
    d.meanTempBot != null && d.meanSalBot != null && d.meanCondTop != null
  )
  const monthIdx = { July: 0, August: 1, September: 2 }
  const parcoordsTrace = [{
    type: "parcoords",
    line: {
      color: validDaily.map(d => monthIdx[d.monthName]),
      colorscale: [[0, "#f97316"], [0.5, "#a855f7"], [1, "#06b6d4"]],
      showscale: false,
    },
    dimensions: [
      { label: "Water Level (ft)", values: validDaily.map(d => d.meanLevel) },
      { label: "Temp Top (C)",     values: validDaily.map(d => d.meanTempTop) },
      { label: "Temp Bottom (C)",  values: validDaily.map(d => d.meanTempBot) },
      { label: "Salinity (ppt)",   values: validDaily.map(d => d.meanSalBot) },
      { label: "Conductance (uS)", values: validDaily.map(d => d.meanCondTop) },
      { label: "Rainfall (in)",    values: validDaily.map(d => d.maxRain) },
    ],
  }]
  const parcoordsLayout = {
    ...DARK,
    margin: { t: 40, r: 30, b: 20, l: 30 },
  }

  /* ── 4. Violin + Box ── */
  const violinTraces = months.map(m => ({
    type: "violin",
    name: m,
    y: daily.filter(d => d.monthName === m && d.meanLevel != null).map(d => d.meanLevel),
    box: { visible: true },
    meanline: { visible: true, color: "#f8fafc", width: 2 },
    line: { color: MONTH_COLORS[m] },
    fillcolor: MONTH_COLORS[m],
    opacity: 0.5,
    points: "outliers",
    marker: { color: MONTH_COLORS[m], opacity: 0.8, size: 5 },
    hoverinfo: "y+name",
  }))
  const violinLayout = {
    ...DARK,
    yaxis: { ...DARK.yaxis, title: { text: "Daily Mean Water Level (ft)", font: { color: "#64748b" } } },
    violinmode: "overlay",
    violingap: 0.1,
  }

  /* ── 5. 2-D Density Contour ── */
  const contourPts = daily.filter(d => d.meanLevel != null && d.meanSalBot != null)
  const contourTraces = [
    {
      type: "histogram2dcontour",
      x: contourPts.map(d => d.meanLevel),
      y: contourPts.map(d => d.meanSalBot),
      colorscale: "Plasma",
      reversescale: false,
      showscale: true,
      contours: { coloring: "heatmap" },
      ncontours: 16,
      colorbar: { tickfont: { color: "#94a3b8" } },
    },
    {
      type: "scatter", mode: "markers", name: "days",
      x: contourPts.map(d => d.meanLevel),
      y: contourPts.map(d => d.meanSalBot),
      marker: { color: "#f8fafc", size: 4, opacity: 0.3 },
      hovertext: contourPts.map(d => `${d.date}: ${d.meanLevel} ft, ${d.meanSalBot} ppt`),
      hoverinfo: "text",
      showlegend: false,
    },
  ]
  const contourLayout = {
    ...DARK,
    xaxis: { ...DARK.xaxis, title: { text: "Water Level (ft)", font: { color: "#64748b" } } },
    yaxis: { ...DARK.yaxis, title: { text: "Salinity Bottom (ppt)", font: { color: "#64748b" } } },
  }

  /* ── 6. Waterfall: weekly cumulative rainfall ── */
  const weekMap = new Map()
  for (const d of daily) {
    const dt = new Date(d.date + "T12:00:00")
    // ISO week key: year + week number
    const startOfYear = new Date(dt.getFullYear(), 0, 1)
    const week = Math.ceil(((dt - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7)
    const key = `W${week}`
    if (!weekMap.has(key)) weekMap.set(key, { key, rain: 0 })
    weekMap.get(key).rain += d.maxRain
  }
  const weeks = [...weekMap.values()]
  const waterfallTrace = [{
    type: "waterfall",
    orientation: "v",
    x: weeks.map(w => w.key),
    y: weeks.map(w => +w.rain.toFixed(2)),
    measure: weeks.map(() => "relative"),
    text: weeks.map(w => `+${w.rain.toFixed(2)}"`),
    textposition: "outside",
    connector: { line: { color: "#475569", width: 1 } },
    increasing: { marker: { color: "#6366f1" } },
    decreasing: { marker: { color: "#475569" } },
    totals:     { marker: { color: "#38bdf8" } },
    hovertemplate: "%{x}<br>+%{y:.2f} in<extra></extra>",
  }]
  const waterfallLayout = {
    ...DARK,
    yaxis: { ...DARK.yaxis, title: { text: "Cumulative Rainfall (in)", font: { color: "#64748b" } } },
    showlegend: false,
  }

  /* ── 7. Indicator gauges ── */
  const seasonTemp  = avg(daily.map(d => d.meanTempTop).filter(v => v != null))
  const seasonSal   = avg(daily.map(d => d.meanSalBot).filter(v => v != null))
  const seasonLevel = avg(daily.map(d => d.meanLevel).filter(v => v != null))

  const gaugeTraces = [
    {
      type: "indicator", mode: "gauge+number+delta",
      value: +seasonTemp.toFixed(2),
      delta: { reference: 30, increasing: { color: "#f97316" }, decreasing: { color: "#38bdf8" } },
      gauge: {
        axis: { range: [25, 35], tickcolor: "#94a3b8" },
        bar: { color: "#f97316" },
        bgcolor: "#0f172a",
        bordercolor: "#334155",
        steps: [
          { range: [25, 29], color: "#1e3a5f" },
          { range: [29, 32], color: "#78350f" },
          { range: [32, 35], color: "#7f1d1d" },
        ],
        threshold: { line: { color: "#ef4444", width: 3 }, thickness: 0.85, value: 32 },
      },
      title: { text: "Season Mean Temp Top (C)", font: { color: "#94a3b8", size: 13 } },
      number: { font: { color: "#f97316" }, suffix: " C" },
      domain: { x: [0, 0.32], y: [0, 1] },
    },
    {
      type: "indicator", mode: "gauge+number+delta",
      value: +seasonSal.toFixed(3),
      delta: { reference: 0.5, increasing: { color: "#ef4444" }, decreasing: { color: "#22c55e" } },
      gauge: {
        axis: { range: [0, 3], tickcolor: "#94a3b8" },
        bar: { color: "#06b6d4" },
        bgcolor: "#0f172a",
        bordercolor: "#334155",
        steps: [
          { range: [0, 0.5],  color: "#052e16" },
          { range: [0.5, 2],  color: "#164e63" },
          { range: [2, 3],    color: "#7f1d1d" },
        ],
        threshold: { line: { color: "#ef4444", width: 3 }, thickness: 0.85, value: 2 },
      },
      title: { text: "Season Mean Salinity Bot (ppt)", font: { color: "#94a3b8", size: 13 } },
      number: { font: { color: "#06b6d4" }, suffix: " ppt" },
      domain: { x: [0.34, 0.66], y: [0, 1] },
    },
    {
      type: "indicator", mode: "gauge+number+delta",
      value: +seasonLevel.toFixed(3),
      delta: { reference: 0.5, increasing: { color: "#22c55e" }, decreasing: { color: "#f97316" } },
      gauge: {
        axis: { range: [0, 1.5], tickcolor: "#94a3b8" },
        bar: { color: "#a855f7" },
        bgcolor: "#0f172a",
        bordercolor: "#334155",
        steps: [
          { range: [0, 0.3],   color: "#3b0764" },
          { range: [0.3, 0.8], color: "#4a044e" },
          { range: [0.8, 1.5], color: "#500724" },
        ],
      },
      title: { text: "Season Mean Water Level (ft)", font: { color: "#94a3b8", size: 13 } },
      number: { font: { color: "#a855f7" }, suffix: " ft" },
      domain: { x: [0.68, 1], y: [0, 1] },
    },
  ]
  const gaugeLayout = {
    paper_bgcolor: "#1e293b",
    plot_bgcolor:  "#1e293b",
    font: { color: "#e2e8f0" },
    margin: { t: 20, r: 20, b: 20, l: 20 },
  }

  /* ── 8. Sankey: flow regime --> rainfall category --> salinity category ── */
  // nodes: 0 Drainage, 1 Neutral, 2 Backpressure  |  3 Low Rain, 4 High Rain  |  5 Fresh, 6 Brackish, 7 Saline
  const nodeLabels = [
    "Drainage", "Near-Neutral", "Backpressure",
    "Rain < 0.5 in/d", "Rain >= 0.5 in/d",
    "Fresh (< 0.5 ppt)", "Brackish (0.5-2 ppt)", "Saline (> 2 ppt)",
  ]

  // rolling 5-day mean for regime
  const N = daily.length
  const baseline = daily.map((_, i) => {
    const from = Math.max(0, i - 2), to = Math.min(N - 1, i + 2)
    const vals = daily.slice(from, to + 1).map(d => d.meanLevel).filter(v => v != null)
    return vals.length ? avg(vals) : null
  })
  const THRESH = 0.01

  // tally link weights
  const links = {}
  const linkKey = (s, t) => `${s}_${t}`
  const addLink = (s, t) => { const k = linkKey(s, t); links[k] = (links[k] || 0) + 1 }

  daily.forEach((d, i) => {
    if (d.meanLevel == null || baseline[i] == null) return
    const res = d.meanLevel - baseline[i]
    const regime = res > THRESH ? 0 : res < -THRESH ? 2 : 1

    const rainHigh = d.maxRain >= 0.5
    const rainNode = rainHigh ? 4 : 3
    addLink(regime, rainNode)

    if (d.meanSalBot == null) return
    const salNode = d.meanSalBot < 0.5 ? 5 : d.meanSalBot <= 2 ? 6 : 7
    addLink(rainNode, salNode)
  })

  const sankeySource = [], sankeyTarget = [], sankeyValue = [], sankeyColor = []
  const LINK_COLORS = {
    "0_3": "rgba(22,163,74,0.45)", "0_4": "rgba(22,163,74,0.45)",
    "1_3": "rgba(71,85,105,0.45)", "1_4": "rgba(71,85,105,0.45)",
    "2_3": "rgba(248,113,113,0.45)", "2_4": "rgba(248,113,113,0.45)",
    "3_5": "rgba(99,102,241,0.4)", "3_6": "rgba(99,102,241,0.4)", "3_7": "rgba(99,102,241,0.4)",
    "4_5": "rgba(99,102,241,0.6)", "4_6": "rgba(99,102,241,0.6)", "4_7": "rgba(99,102,241,0.6)",
  }
  for (const [k, v] of Object.entries(links)) {
    const [s, t] = k.split("_").map(Number)
    sankeySource.push(s); sankeyTarget.push(t); sankeyValue.push(v)
    sankeyColor.push(LINK_COLORS[k] || "rgba(148,163,184,0.3)")
  }

  const sankeyTrace = [{
    type: "sankey",
    orientation: "h",
    node: {
      pad: 16, thickness: 22,
      label: nodeLabels,
      color: [
        "#16a34a", "#475569", "#f87171",     // regime
        "#6366f1", "#a855f7",                 // rain
        "#22c55e", "#0ea5e9", "#ef4444",      // salinity
      ],
      line: { color: "#0f172a", width: 0.5 },
    },
    link: { source: sankeySource, target: sankeyTarget, value: sankeyValue, color: sankeyColor },
  }]
  const sankeyLayout = {
    ...DARK,
    font: { color: "#e2e8f0", size: 11 },
    margin: { t: 10, r: 10, b: 10, l: 10 },
  }

  /* ── 9. Filled area time series (shared concept, Plotly hover/spike style) ── */
  const timeTraces = [
    {
      type: "scatter", mode: "lines", name: "Water Level (ft)",
      x: daily.map(d => d.date), y: daily.map(d => d.meanLevel),
      fill: "tozeroy", fillcolor: "rgba(56,189,248,0.15)",
      line: { color: "#38bdf8", width: 1.5 },
      yaxis: "y",
      hovertemplate: "%{x}<br>Level: %{y:.3f} ft<extra></extra>",
    },
    {
      type: "bar", name: "Rainfall (in)",
      x: daily.map(d => d.date), y: daily.map(d => d.maxRain),
      marker: { color: "#6366f1", opacity: 0.7 },
      yaxis: "y2",
      hovertemplate: "%{x}<br>Rain: %{y:.2f} in<extra></extra>",
    },
  ]
  const timeLayout = {
    ...DARK,
    yaxis:  { ...DARK.yaxis, title: { text: "Water Level (ft)", font: { color: "#38bdf8" } } },
    yaxis2: {
      title: { text: "Rainfall (in)", font: { color: "#6366f1" } },
      overlaying: "y", side: "right",
      gridcolor: "#334155", tickfont: { color: "#94a3b8" },
    },
    hovermode: "x unified",
    legend: { ...DARK.legend },
    barmode: "overlay",
  }

  return (
    <div style={pageStyle}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: 4 }}>Plotly.js: Interactive by Default</h1>
      <p style={descStyle}>
        Every chart below is rendered by{" "}
        <strong style={{ color: "#f8fafc" }}>Plotly.js</strong> via imperative{" "}
        <code style={{ color: "#38bdf8" }}>Plotly.newPlot()</code> calls.
        Unlike Chart.js and Recharts, Plotly ships a full interactive toolbar on every chart
        (zoom, pan, box/lasso select, reset axes, download PNG) with zero configuration.
        It also offers first-class 3-D (WebGL), parallel coordinates, violin plots, waterfall
        charts, Sankey diagrams, and indicator gauges: chart types that require custom plugins
        or hand-rolled SVG math in the other libraries.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", margin: "0.75rem 0 0.5rem", fontSize: "0.82rem" }}>
        <div>
          <div style={{ color: "#34d399", fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Strengths</div>
          <ul style={{ margin: 0, paddingLeft: "1.15rem", color: "#94a3b8", lineHeight: 1.5 }}>
            <li>Full interaction toolbar (zoom, pan, lasso, reset axes, download PNG) on every chart with zero config</li>
            <li>The only library here with true 3-D WebGL rendering via the <code>scatter3d</code> trace type</li>
            <li>Statistical and flow charts built-in: violin + box hybrid, 2-D density contour, parallel coords, Sankey, waterfall</li>
            <li>Rich hover templates and formatted tooltips with no additional setup</li>
          </ul>
        </div>
        <div>
          <div style={{ color: "#f87171", fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Limitations</div>
          <ul style={{ margin: 0, paddingLeft: "1.15rem", color: "#94a3b8", lineHeight: 1.5 }}>
            <li>Very large bundle (~4.6 MB minified): must be lazy-loaded to avoid blocking startup</li>
            <li>Imperative <code>Plotly.newPlot()</code> API integrates awkwardly with React's render cycle</li>
            <li>Less flexible than D3 for highly custom layouts; themed styling requires fighting the default template system</li>
            <li>Canvas performance can lag behind SVG alternatives for extremely dense scatter plots</li>
          </ul>
        </div>
      </div>

      {/* 1. Scatter + OLS */}
      <h2 style={headingStyle}>1. Scatter + OLS Trendlines: Temperature vs Salinity by Month</h2>
      <p style={descStyle}>
        A familiar scatter plot (present in all four libraries), but Plotly's hover delivers rich
        formatted tooltips automatically. OLS trendlines are added as separate dotted line traces
       : in Chart.js this requires <code>chartjs-plugin-trendline</code>; here it is two extra
        data points and a <code>dash: "dot"</code> property. The toolbar lets users zoom into any
        cluster and download the view as a PNG in one click.
      </p>
      <div style={boxStyle}>
        <PlotBox id="scatter" traces={scatterTraces} layout={scatterLayout} />
      </div>

      {/* 2. 3-D Scatter */}
      <h2 style={headingStyle}>2. 3-D Scatter (scatter3d): Temp Top vs Temp Bottom vs Water Level</h2>
      <p style={descStyle}>
        Plotly renders this with WebGL via <code>scatter3d</code>. The three axes encode
        surface temperature, bottom temperature, and water level simultaneously: a relationship
        that requires either multiple 2-D charts or mental gymnastics in the other libraries.
        Drag to orbit, scroll to zoom. The month colour coding reveals whether thermal
        stratification (gap between top and bottom temp) correlates with tidal stage.
      </p>
      <div style={boxStyle}>
        <PlotBox id="scatter3d" traces={scatter3dTraces} layout={scatter3dLayout} height={420} />
      </div>

      {/* 3. Parallel Coordinates */}
      <h2 style={headingStyle}>3. Parallel Coordinates: Multivariate Brush Filter</h2>
      <p style={descStyle}>
        Each vertical axis is one variable; each line is one day. Lines are coloured by month
        (orange = July, purple = August, teal = September). Drag a range handle on any axis
        to filter the dataset: lines not matching all active filters fade out. This reveals, for
        example, that high-salinity days (right axis) cluster with high conductance and specific
        water-level windows. No other library in this app offers brushable multi-axis filtering
        as a built-in trace type.
      </p>
      <div style={boxStyle}>
        <PlotBox id="parcoords" traces={parcoordsTrace} layout={parcoordsLayout} height={320} />
      </div>

      {/* 4. Violin */}
      <h2 style={headingStyle}>4. Violin + Box: Water Level Distribution per Month</h2>
      <p style={descStyle}>
        Plotly's <code>violin</code> trace type draws KDE bandwidth estimation, IQR box, median
        line, and outlier points in one declaration. In Chart.js this requires the community
        plugin <code>chartjs-chart-box-and-violin-plot</code>; in D3 it requires manual
        Epanechnikov KDE code (as in chart 8 on the D3 page). Here it is a single trace object
        with <code>box: {"{ visible: true }"}</code>. The mean line is overlaid automatically.
      </p>
      <div style={boxStyle}>
        <PlotBox id="violin" traces={violinTraces} layout={violinLayout} />
      </div>

      {/* 5. Density Contour */}
      <h2 style={headingStyle}>5. 2-D Density Contour: Water Level vs Salinity Concentration</h2>
      <p style={descStyle}>
        <code>histogram2dcontour</code> bins the (water level, salinity) pairs, applies 2-D KDE
        smoothing, and draws filled isocontours coloured by density: all server-side computed by
        Plotly with no math code. The raw scatter points are overlaid in white for reference.
        Darker regions are the most common (level, salinity) combinations across the season.
        An equivalent in D3 would require <code>d3-contour</code> and a manual kernel; not
        available at all in Chart.js or Recharts.
      </p>
      <div style={boxStyle}>
        <PlotBox id="contour" traces={contourTraces} layout={contourLayout} />
      </div>

      {/* 6. Waterfall */}
      <h2 style={headingStyle}>6. Waterfall Chart: Weekly Cumulative Rainfall</h2>
      <p style={descStyle}>
        The <code>waterfall</code> trace type stacks each week's rainfall as a floating bar whose
        bottom starts where the previous bar's top ended, turning individual weekly totals into a
        running cumulative. Colour encodes direction (increase = indigo). It is a first-class
        Plotly trace; replicating it in Chart.js requires a hidden "offset" dataset and manual
        stacking arithmetic. Recharts and D3 have no built-in waterfall primitive.
      </p>
      <div style={boxStyle}>
        <PlotBox id="waterfall" traces={waterfallTrace} layout={waterfallLayout} />
      </div>

      {/* 7. Indicator Gauges */}
      <h2 style={headingStyle}>7. Indicator Gauges: Season-Wide KPI Summary</h2>
      <p style={descStyle}>
        Three <code>indicator</code> traces share one figure via <code>domain</code> tiling.
        Each gauge shows the season-mean value, a delta vs a reference threshold, and a coloured
        arc with threshold marker. Gauge/KPI widgets require a separate plugin in every other
        library here; Plotly ships them as a first-class trace type supporting gauges, number
        displays, and delta indicators in a single object.
      </p>
      <div style={boxStyle}>
        <PlotBox id="gauges" traces={gaugeTraces} layout={gaugeLayout} height={240} />
      </div>

      {/* 8. Sankey */}
      <h2 style={headingStyle}>8. Sankey Diagram: Flow Regime to Rainfall to Salinity</h2>
      <p style={descStyle}>
        Each day is classified by flow regime (drainage / near-neutral / backpressure), rainfall
        intensity (low / high), and resulting salinity category (fresh / brackish / saline). The
        ribbon widths encode the count of days along each path. This reveals, for example, whether
        backpressure days tend to coincide with high rain and elevated salinity. The{" "}
        <code>sankey</code> trace type computes the node and link layout automatically from a
        source/target/value array: no layout math required. Not available in Chart.js, Recharts,
        or D3 without a third-party plugin.
      </p>
      <div style={boxStyle}>
        <PlotBox id="sankey" traces={sankeyTrace} layout={sankeyLayout} height={360} />
      </div>

      {/* 9. Dual-axis time series */}
      <h2 style={headingStyle}>9. Dual-Axis Time Series: Water Level + Rainfall with Unified Hover</h2>
      <p style={descStyle}>
        A filled area and a bar chart share the x-axis but use two independent y-axes (left =
        water level, right = rainfall). Plotly's <code>hovermode: "x unified"</code> snaps both
        series' values into a single tooltip on hover without any custom tooltip code: a single
        layout property that would require a custom plugin or tooltip render function in every
        other library. The spike lines (vertical guide line on hover) are also automatic.
      </p>
      <div style={boxStyle}>
        <PlotBox id="timeseries" traces={timeTraces} layout={timeLayout} />
      </div>
    </div>
  )
}
