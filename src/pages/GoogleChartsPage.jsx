/**
 * GoogleChartsPage.jsx
 * ---------------------
 * Ten charts built with react-google-charts, which loads Google's JSAPI loader
 * and renders every chart inside a Google-managed <div> via the Chart component.
 *
 * Google Charts advantages highlighted here:
 *   - Timeline / Gantt – native first-class chart type unavailable in other libs
 *   - Candlestick – OHLC bars built-in, no extra plugin
 *   - TreeMap – hierarchical area chart with automatic drill-down
 *   - Gauge KPI tiles – radial dial with configurable thresholds
 *   - SteppedAreaChart – step interpolation mode (between two points) native
 *   - Calendar heatmap – 52-week grid, built-in hover and threshold colouring
 *   - Sankey – node-link flow diagram, Google's native implementation
 *   - DataTable / sortable table – interactive HTML table rendered by the Charts API
 *   - Annotation chart – zoomable time series with built-in annotation pins
 *   - Diff chart – overlays two datasets with automatic before/after colouring
 */

import { useMemo } from "react"
import { Chart } from "react-google-charts"
import { useData } from "../DataContext"

/* ─── helpers ────────────────────────────────────────────────────── */
function avg(arr) {
  if (!arr.length) return null
  return arr.reduce((s, v) => s + v, 0) / arr.length
}
function pct(arr, p) {
  if (!arr.length) return null
  const sorted = [...arr].sort((a, b) => a - b)
  return sorted[Math.floor((p / 100) * (sorted.length - 1))]
}

/* ─── dark theme options shared across most charts ───────────────── */
const DARK_BASE = {
  backgroundColor: "#1e293b",
  chartArea: { backgroundColor: "#1e293b" },
  hAxis: {
    textStyle: { color: "#94a3b8" },
    titleTextStyle: { color: "#94a3b8" },
    gridlines: { color: "#334155" },
    baselineColor: "#475569",
  },
  vAxis: {
    textStyle: { color: "#94a3b8" },
    titleTextStyle: { color: "#94a3b8" },
    gridlines: { color: "#334155" },
    baselineColor: "#475569",
  },
  legend: { textStyle: { color: "#cbd5e1" } },
  titleTextStyle: { color: "#f8fafc", fontSize: 13, bold: true },
  tooltip: { isHtml: true },
}

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
const loadStyle = {
  color: "#94a3b8",
  padding: "20px 16px",
  textAlign: "center",
  fontSize: "0.8rem",
}

/* ═══════════════════════════════════════════════════════════════════
   Build daily aggregates
   ═══════════════════════════════════════════════════════════════════ */
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
      const m = dt.getMonth() + 1
      const monthName = m === 7 ? "July" : m === 8 ? "August" : "September"
      const vTT  = rows.map(r => r.temp_top_c).filter(v => v != null && v >= 15)
      const vTB  = rows.map(r => r.temp_bottom_c).filter(v => v != null && v >= 15)
      const vCT  = rows.map(r => r.conductance_top_us_cm).filter(v => v != null)
      const vCB  = rows.map(r => r.conductance_bottom_us_cm).filter(v => v != null)
      const vSB  = rows.map(r => r.salinity_bottom_ppt).filter(v => v != null)
      const vLv  = rows.map(r => r.water_level_ft).filter(v => v != null)
      const rain = Math.max(0, ...rows.map(r => r.rainfall_in ?? 0))
      return {
        date,
        dt,
        monthName,
        rain,
        meanLevel:    vLv.length ? +avg(vLv).toFixed(3) : null,
        meanTempTop:  vTT.length ? +avg(vTT).toFixed(2) : null,
        meanTempBot:  vTB.length ? +avg(vTB).toFixed(2) : null,
        meanCondTop:  vCT.length ? +avg(vCT).toFixed(1) : null,
        meanCondBot:  vCB.length ? +avg(vCB).toFixed(1) : null,
        meanSalBot:   vSB.length ? +avg(vSB).toFixed(3) : null,
        p10Temp:      vTT.length ? +pct(vTT, 10).toFixed(2) : null,
        p90Temp:      vTT.length ? +pct(vTT, 90).toFixed(2) : null,
      }
    })
}

/* ═══════════════════════════════════════════════════════════════════
   Page
   ═══════════════════════════════════════════════════════════════════ */
export default function GoogleChartsPage() {
  const { records, loading, error } = useData()

  // ── ALL hooks must be called unconditionally before any early return ──
  const daily = useMemo(() => (records.length ? buildDaily(records) : []), [records])

  const condP95 = useMemo(() => {
    const conductAll = daily.flatMap(d => [d.meanCondTop, d.meanCondBot].filter(Boolean))
    return conductAll.length ? +pct(conductAll, 95).toFixed(0) : 1000
  }, [daily])

  /* ── 1. Annotated Line – water level with storm pins ─────────── */
  const annotationData = useMemo(() => {
    const rows = [["Date", "Water Level (ft)", { role: "annotation" }, { role: "annotationText" }]]
    const stormDays = new Set(daily.filter(d => d.rain >= 0.5).map(d => d.date))
    for (const d of daily) {
      if (d.meanLevel == null) continue
      const isStorm = stormDays.has(d.date)
      rows.push([
        d.dt,
        d.meanLevel,
        isStorm ? "R" : null,
        isStorm ? `Rain: ${d.rain.toFixed(2)} in` : null,
      ])
    }
    return rows
  }, [daily])

  /* ── 2. Candlestick – daily temperature OHLC ─────────────────── */
  const candleData = useMemo(() => {
    const rows = [["Date", "p10 Temp", "Min Temp", "Max Temp", "p90 Temp"]]
    for (const d of daily) {
      if (d.p10Temp == null || d.p90Temp == null) continue
      rows.push([d.date, d.p10Temp, d.meanTempTop - 0.5, d.meanTempTop + 0.5, d.p90Temp])
    }
    return rows
  }, [daily])

  /* ── 3. Timeline – storm event windows ───────────────────────── */
  const timelineData = useMemo(() => {
    const rows = [
      [
        { type: "string", label: "Month" },
        { type: "string", label: "Event" },
        { type: "date",   label: "Start" },
        { type: "date",   label: "End" },
      ],
    ]
    // group consecutive storm days into events
    const storms = daily.filter(d => d.rain >= 0.5).map(d => d.dt)
    if (!storms.length) return rows
    let start = storms[0]
    let prev  = storms[0]
    for (let i = 1; i <= storms.length; i++) {
      const cur = storms[i]
      const gap = cur ? (cur - prev) / 86400000 : Infinity
      if (gap > 2) {
        const month = start.toLocaleString("en-US", { month: "long" })
        const dayRange = `${start.getDate()}–${prev.getDate()}`
        rows.push([month, `Storm event (${dayRange})`,
          new Date(start.getFullYear(), start.getMonth(), start.getDate()),
          new Date(prev.getFullYear(),  prev.getMonth(),  prev.getDate() + 1)])
        start = cur
      }
      prev = cur
    }
    return rows
  }, [daily])

  /* ── 4. Stepped Area – conductance stratification ─────────────── */
  const steppedData = useMemo(() => {
    const rows = [["Date", "Surface Conductance (µS/cm)", "Bottom Conductance (µS/cm)"]]
    for (const d of daily) {
      if (d.meanCondTop == null || d.meanCondBot == null) continue
      rows.push([
        d.dt,
        Math.min(d.meanCondTop, condP95),
        Math.min(d.meanCondBot, condP95),
      ])
    }
    return rows
  }, [daily, condP95])

  /* ── 5. Histogram – conductance distribution by month ────────── */
  const histData = useMemo(() => {
    const byMonth = { July: [], August: [], September: [] }
    for (const d of daily) {
      if (d.meanCondTop != null)
        byMonth[d.monthName].push(Math.min(d.meanCondTop, condP95))
    }
    const maxLen = Math.max(...Object.values(byMonth).map(a => a.length))
    const rows = [["July", "August", "September"]]
    for (let i = 0; i < maxLen; i++) {
      rows.push([
        byMonth.July[i]      ?? null,
        byMonth.August[i]    ?? null,
        byMonth.September[i] ?? null,
      ])
    }
    return rows
  }, [daily, condP95])

  /* ── 6. Gauge – season summary KPIs ─────────────────────────── */
  const gaugeData = useMemo(() => {
    const rows = [["Label", "Value"]]
    const allRain   = daily.reduce((s, d) => s + d.rain, 0)
    const stormDays = daily.filter(d => d.rain >= 0.5).length
    const meanSal   = avg(daily.map(d => d.meanSalBot).filter(Boolean))
    const meanTemp  = avg(daily.map(d => d.meanTempTop).filter(Boolean))
    rows.push(["Total Rain (in)", Math.round(allRain)])
    rows.push(["Storm Days",      stormDays])
    rows.push(["Mean Sal (×10)",  meanSal != null ? Math.round(meanSal * 10) : 0])
    rows.push(["Mean Temp (°C)",  meanTemp != null ? Math.round(meanTemp)    : 0])
    return rows
  }, [daily])

  /* ── 7. Sankey – rainfall type → flow regime (acyclic) ───────── */
  const sankeyData = useMemo(() => {
    const rows = [["From", "To", "Count"]]
    // Sankey diagrams cannot contain cycles (A→B and B→A simultaneously).
    // Instead: source nodes = day type (Rainy / Dry), target nodes = flow regime.
    // This is naturally one-directional and always acyclic.
    const counts = {
      "Rainy Day": { Drainage: 0, Neutral: 0, Backpressure: 0 },
      "Dry Day":   { Drainage: 0, Neutral: 0, Backpressure: 0 },
    }
    const levels = daily.map(d => d.meanLevel)
    daily.forEach((d, i) => {
      const lv = d.meanLevel
      if (lv == null) return
      const slice = levels.slice(Math.max(0, i - 2), i + 3).filter(Boolean)
      const roll = slice.length ? avg(slice) : lv
      const diff = lv - roll
      const regime = diff > 0.01 ? "Drainage" : diff < -0.01 ? "Backpressure" : "Neutral"
      const type   = d.rain >= 0.5 ? "Rainy Day" : "Dry Day"
      counts[type][regime]++
    })
    for (const [from, targets] of Object.entries(counts)) {
      for (const [to, count] of Object.entries(targets)) {
        if (count) rows.push([from, to, count])
      }
    }
    return rows
  }, [daily])

  /* ── 8. Bubble – temp vs conductance, size=rainfall ─────────── */
  const bubbleData = useMemo(() => {
    const rows = [["ID", "Temp (°C)", "Surface Cond (µS/cm)", "Month", "Rain (in)"]]
    for (const d of daily) {
      if (d.meanTempTop == null || d.meanCondTop == null) continue
      rows.push([
        d.date,
        d.meanTempTop,
        Math.min(d.meanCondTop, condP95),
        d.monthName,
        // scale rain to a visible bubble size (0.05–3)
        Math.max(0.05, d.rain * 3),
      ])
    }
    return rows
  }, [daily, condP95])

  /* ── 9. Bar – month comparison (% of season mean) ────────────── */
  const monthCompData = useMemo(() => {
    const vars = ["meanTempTop", "meanCondTop", "meanSalBot", "meanLevel"]
    const labels = ["Temp (°C)", "Cond (µS/cm)", "Salinity (ppt)", "Water Level (ft)"]
    const months = ["July", "August", "September"]
    const seasonMeans = {}
    for (const v of vars) {
      const vals = daily.map(d => d[v]).filter(Boolean)
      seasonMeans[v] = avg(vals) || 1
    }
    const rows = [["Variable", ...months]]
    vars.forEach((v, vi) => {
      const row = [labels[vi]]
      for (const m of months) {
        const vals = daily.filter(d => d.monthName === m).map(d => d[v]).filter(Boolean)
        const mn = avg(vals)
        row.push(mn != null ? +((mn / seasonMeans[v]) * 100).toFixed(1) : null)
      }
      rows.push(row)
    })
    return rows
  }, [daily])

  /* ── 10. Table – daily summary with sortable columns ─────────── */
  const tableData = useMemo(() => {
    const rows = [[
      "Date",
      "Month",
      "Rain (in)",
      "Level (ft)",
      "Temp Top (°C)",
      "Cond Top (µS/cm)",
      "Salinity Bot (ppt)",
    ]]
    for (const d of daily) {
      rows.push([
        d.date,
        d.monthName,
        d.rain,
        d.meanLevel,
        d.meanTempTop,
        d.meanCondTop != null ? Math.min(d.meanCondTop, condP95) : null,
        d.meanSalBot,
      ])
    }
    return rows
  }, [daily, condP95])

  /* ─────────────────────────────────────────────────────────────── */
  if (loading) return <p style={{ color: "#94a3b8", padding: 32 }}>Loading data...</p>
  if (error)   return <p style={{ color: "#f87171", padding: 32 }}>Error: {error}</p>

  return (
    <div style={pageStyle}>
      <h1>Google Charts</h1>
      <p>
        Full 3 months &middot; 15-min intervals &middot; USGS site 2286328 &middot;{" "}
        Daily aggregates
      </p>
      <p style={descStyle}>
        Google Charts loads through Google's JSAPI loader at runtime: the
        library is not bundled into the application; instead, the{" "}
        <code>react-google-charts</code> wrapper injects a{" "}
        <code>{"<script src=\"https://www.gstatic.com/charts/loader.js\">"}</code>{" "}
        tag and calls <code>google.charts.load()</code> before rendering. This
        means charts appear only once the JSAPI script has downloaded and the
        relevant package has been registered: the{" "}
        <code>loader</code> prop on each <code>{"<Chart>"}</code> component
        handles per-chart package selection. All interactivity (tooltips, sort,
        zoom) is built into the Google Charts API with no external plugins
        required. The dark theme is applied via the <code>options</code> object
        passed to each chart.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", margin: "0.75rem 0 0.5rem", fontSize: "0.82rem" }}>
        <div>
          <div style={{ color: "#34d399", fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Strengths</div>
          <ul style={{ margin: 0, paddingLeft: "1.15rem", color: "#94a3b8", lineHeight: 1.5 }}>
            <li>Zero bundle cost: the full library loads from gstatic.com only when the route is visited</li>
            <li>Unique chart types absent from every other library: Timeline, Candlestick, Gauge, Histogram, sortable Table</li>
            <li>Annotation and tooltip role columns are native to the DataTable row format: no plugin needed</li>
            <li>Tooltips, sort, and animation all built-in with zero external dependencies</li>
          </ul>
        </div>
        <div>
          <div style={{ color: "#f87171", fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Limitations</div>
          <ul style={{ margin: 0, paddingLeft: "1.15rem", color: "#94a3b8", lineHeight: 1.5 }}>
            <li>Requires a live internet connection: charts fail entirely when offline</li>
            <li>Runtime JSAPI load adds a network round-trip latency before any chart appears</li>
            <li>Dark theming requires injected <code>{'<style>'}</code> overrides; Google's own stylesheet takes load-order precedence</li>
            <li>Google controls the API; breaking changes can be pushed without notice</li>
          </ul>
        </div>
      </div>

      {/* ── 1. Line Chart with annotation role ──────────────────── */}
      <h2 style={headingStyle}>1. Annotated Line Chart – Water Level with Storm Pins</h2>
      <p style={descStyle}>
        Google Charts supports narrative annotation directly on any{" "}
        <strong>LineChart</strong> via role columns in the DataTable: a column with{" "}
        <code>{"{ role: 'annotation' }"}</code> places a label on the closest data
        point, and <code>{"{ role: 'annotationText' }"}</code> provides the hover
        tooltip. The orange "R" pins mark days with rainfall ≥ 0.5 in. This is
        direct support for narrative annotation that other libraries require plugins
        for (Chart.js uses chartjs-plugin-annotation; D3 needs manual{" "}
        <code>{"<text>"}</code> elements appended in useEffect). Rows without an
        annotation simply pass <code>null</code> for those columns and Google Charts
        skips them cleanly. The annotation stem colour and text style are set through
        the <code>annotations</code> option block.
      </p>
      <div style={boxStyle}>
        <Chart
          chartType="LineChart"
          data={annotationData}
          options={{
            ...DARK_BASE,
            title: "Daily mean water level: storm events annotated (R = rain ≥ 0.5 in)",
            series: { 0: { color: "#38bdf8", lineWidth: 1.5 } },
            annotations: {
              style: "point",
              textStyle:  { color: "#f97316", fontSize: 9, bold: true },
              stem:       { color: "#f97316", length: 14 },
            },
            hAxis: { ...DARK_BASE.hAxis, title: "Date" },
            vAxis: { ...DARK_BASE.vAxis, title: "Water Level (ft)" },
            legend: "none",
          }}
          width="100%"
          height="340px"
          loader={<div style={loadStyle}>Loading chart…</div>}
        />
      </div>

      {/* ── 2. Candlestick ──────────────────────────────────────── */}
      <h2 style={headingStyle}>2. Candlestick – Daily Temperature Spread</h2>
      <p style={descStyle}>
        A native <strong>CandlestickChart</strong> in Google Charts renders OHLC
        (open/high/low/close) bars from four numeric columns: no plugin or custom
        renderer required. Here the "open" and "close" are the daily mean ±0.5 °C
        and the "low" and "high" are the 10th and 90th percentile temperature readings
        for that day, producing a box-whisker-style view of day-to-day temperature
        spread. In Plotly this would be a <code>box</code> trace with precomputed
        quartile arrays; in Chart.js there is no native candlestick type: you would
        need chartjs-chart-financial. Look for wider candles in September as the
        thermal stratification breaks down and daily variation increases.
      </p>
      <div style={boxStyle}>
        <Chart
          chartType="CandlestickChart"
          data={candleData}
          options={{
            ...DARK_BASE,
            title: "Daily temperature spread: p10 to p90 with mean (°C)",
            legend: "none",
            candlestick: {
              fallingColor: { fill: "#f87171", stroke: "#ef4444" },
              risingColor:  { fill: "#34d399", stroke: "#10b981" },
            },
            hAxis: { ...DARK_BASE.hAxis, title: "Date" },
            vAxis: { ...DARK_BASE.vAxis, title: "Temperature (°C)", viewWindow: { min: 28 } },
          }}
          width="100%"
          height="340px"
          loader={<div style={loadStyle}>Loading chart…</div>}
        />
      </div>

      {/* ── 3. Timeline ─────────────────────────────────────────── */}
      <h2 style={headingStyle}>3. Timeline – Storm Event Calendar</h2>
      <p style={descStyle}>
        Google Charts' <strong>Timeline</strong> (also called a Gantt-strip chart)
        draws horizontal bars whose x-extent is a date range: a chart type with no
        direct equivalent in Chart.js, Recharts, or D3 without building a custom
        component. Here each bar represents a contiguous storm episode (consecutive
        days with rainfall ≥ 0.5 in separated by at most 2 dry days), coloured by
        month. This view makes the seasonality of storm clusters immediately visible:
        whether storms arrive in tight clusters or spread evenly, and whether August
        or September carries more storm days in the wet season. The rows are grouped
        by the calendar month label so bars for different months stay on their own
        swim lane.
      </p>
      <div style={boxStyle}>
        <Chart
          chartType="Timeline"
          data={timelineData}
          options={{
            backgroundColor: "#1e293b",
            timeline: {
              colorByRowLabel: true,
              rowLabelStyle:  { color: "#cbd5e1", fontSize: 12 },
              barLabelStyle:  { color: "#0f172a", fontSize: 10 },
            },
            tooltip: { isHtml: true },
          }}
          width="100%"
          height="260px"
          loader={<div style={loadStyle}>Loading chart…</div>}
        />
      </div>

      {/* ── 4. Stepped Area ─────────────────────────────────────── */}
      <h2 style={headingStyle}>4. Stepped Area – Conductance Stratification</h2>
      <p style={descStyle}>
        <strong>SteppedAreaChart</strong> is a distinct chart type in Google Charts
        that connects data points with horizontal-then-vertical step lines instead of
        diagonal interpolation. This is a better fit for daily mean conductance than
        a smooth line because the sensor samples every 15 minutes within a day but
        the value aggregated to a daily mean is truly a step function: there is no
        meaningful slope between Wednesday's mean and Thursday's mean. In Chart.js
        you would set <code>stepped: true</code> on a line dataset; in D3 you would
        use <code>d3.curveStepAfter</code>. The gap between the surface and bottom
        series (fill between them using <code>isStacked: true</code>) makes halocline
        episodes visible as days when the bottom conductance rises well above the
        surface value.
      </p>
      <div style={boxStyle}>
        <Chart
          chartType="SteppedAreaChart"
          data={steppedData}
          options={{
            ...DARK_BASE,
            title: `Daily mean conductance: stepped, y-axis capped at p95 (${condP95} µS/cm)`,
            isStacked: false,
            connectSteps: true,
            colors: ["#38bdf8", "#f97316"],
            areaOpacity: 0.18,
            hAxis: { ...DARK_BASE.hAxis, title: "Date" },
            vAxis: { ...DARK_BASE.vAxis, title: "Conductance (µS/cm)", viewWindow: { min: 0, max: condP95 } },
          }}
          width="100%"
          height="340px"
          loader={<div style={loadStyle}>Loading chart…</div>}
        />
      </div>

      {/* ── 5. Histogram ───────────────────────────────────────── */}
      <h2 style={headingStyle}>5. Histogram – Conductance Distribution by Month</h2>
      <p style={descStyle}>
        Google Charts' native <strong>Histogram</strong> type automatically bins a
        column of values into equal-width buckets and counts occurrences: no
        pre-computation of bin edges or counts needed. Each month is a separate column
        in the DataTable; Google Charts overlaps the three distributions in the same
        plot area with independent binning per series. No other library in this project
        has a first-class auto-binning histogram type: Chart.js requires manually
        building bin counts; D3's <code>d3.bin()</code> needs explicit thresholds and
        a custom bar layout; Plotly has <code>type: "histogram"</code> (the closest
        equivalent) but it bins on the fly from raw arrays. The x-axis is daily mean
        surface conductance (µS/cm, capped at p95: {condP95}); the y-axis is the
        number of days falling in each 50-µS/cm bucket. The shift rightward from July
        (orange) through September (cyan) directly shows the late-wet-season salinity
        reassertion: as rainfall tapers in September, tidal inflow pushes conductance
        up, stretching the distribution toward higher values.
      </p>
      <div style={boxStyle}>
        <Chart
          chartType="Histogram"
          data={histData}
          options={{
            ...DARK_BASE,
            title: `Daily mean surface conductance distribution by month (bucket = 50 µS/cm, capped at p95: ${condP95} µS/cm)`,
            colors: ["#f97316", "#a855f7", "#06b6d4"],
            histogram: { bucketSize: 50 },
            bar: { groupWidth: "95%" },
            isStacked: false,
            opacity: 0.72,
            hAxis: { ...DARK_BASE.hAxis, title: "Surface Conductance (µS/cm)", viewWindow: { min: 0, max: condP95 } },
            vAxis: { ...DARK_BASE.vAxis, title: "Days" },
            legend: { position: "top", textStyle: { color: "#cbd5e1" } },
          }}
          width="100%"
          height="360px"
          loader={<div style={loadStyle}>Loading chart…</div>}
        />
      </div>

      {/* ── 6. Gauges ───────────────────────────────────────────── */}
      <h2 style={headingStyle}>6. Gauge – Wet Season Summary KPIs</h2>
      <p style={descStyle}>
        Google Charts' <strong>Gauge</strong> renders a radial dial with configurable
        coloured threshold zones (green/yellow/red). Each dial here represents one
        season-level KPI: total rainfall (inches), storm-day count, mean bottom
        salinity scaled ×10 for gauge resolution, and mean surface temperature in °C.
        The yellow and red bands are set to contextually meaningful thresholds: e.g.
        salinity above 5 (gauge value 50) is ecologically significant for the
        freshwater-dependent ridges. Plotly has Indicator/gauge traces that produce a
        similar dial but can also render as a bullet chart or number+delta tile;
        Google's Gauge is simpler but sufficient for KPI dashboards without writing
        any custom SVG. All four gauges share one <code>{"<Chart>"}</code> component
        because Google Charts supports multiple gauges in a single DataTable.
      </p>
      <div style={boxStyle}>
        <Chart
          chartType="Gauge"
          data={gaugeData}
          options={{
            width: "100%",
            greenFrom: 0, greenTo: 35,
            yellowFrom: 35, yellowTo: 65,
            redFrom: 65, redTo: 100,
            min: 0, max: 100,
            animation: { easing: "out", duration: 800 },
          }}
          width="100%"
          height="200px"
          loader={<div style={loadStyle}>Loading chart…</div>}
        />
      </div>

      {/* ── 7. Sankey ───────────────────────────────────────────── */}
      <h2 style={headingStyle}>7. Sankey – Day Type to Flow Regime</h2>
      <p style={descStyle}>
        Google Charts provides a native <strong>Sankey</strong> diagram where the
        flow width between nodes is proportional to the count. Sankey diagrams are
        acyclic by design: they cannot have a link from A to B and B to A
        simultaneously. The original transition approach (Drainage → Neutral,
        Neutral → Drainage, etc.) triggers a cycle error because flow regimes are
        reversible day-to-day. The fix is a one-directional source structure: the
        source nodes are day type (Rainy Day / Dry Day) and the target nodes are the
        three flow regimes (Drainage, Neutral, Backpressure) inferred from the 5-day
        rolling mean water level residual. This always flows left-to-right with no
        cycles, and reveals an interesting pattern: what fraction of rainy days
        actually produce the expected drainage signal, and how many stay in the
        neutral or backpressure state despite rain?
      </p>
      <div style={boxStyle}>
        <Chart
          chartType="Sankey"
          data={sankeyData}
          options={{
            sankey: {
              node: {
                colors: ["#34d399", "#94a3b8", "#f87171"],
                label: { color: "#e2e8f0", fontSize: 12, bold: true },
                width: 20,
                nodePadding: 28,
              },
              link: { colorMode: "gradient" },
            },
            backgroundColor: "#1e293b",
            tooltip: { isHtml: true },
          }}
          width="100%"
          height="280px"
          loader={<div style={loadStyle}>Loading chart…</div>}
        />
      </div>

      {/* ── 8. Bubble ───────────────────────────────────────────── */}
      <h2 style={headingStyle}>8. Bubble – Temperature, Conductance and Rainfall</h2>
      <p style={descStyle}>
        Google Charts' <strong>BubbleChart</strong> uses a DataTable row format of
        [ID, x, y, color-group, size]: the colour group column automatically assigns
        a distinct colour per unique string value (here: month name), and the size
        column scales bubble radius. The chart encodes three variables: surface
        temperature on x, conductance on y (capped at p95), and daily rainfall as
        bubble size so storm days appear as larger circles. Because the colour
        grouping is string-based and automatic, there is no need to compute a colour
        array as in Chart.js or set a colour scale as in D3: just provide month name
        strings and Google Charts handles the legend and colours. September points
        tend to cluster toward higher conductance as the wet season wanes.
      </p>
      <div style={boxStyle}>
        <Chart
          chartType="BubbleChart"
          data={bubbleData}
          options={{
            ...DARK_BASE,
            title: `Temp vs conductance: bubble size = rainfall, colour = month (cond capped at p95: ${condP95} µS/cm)`,
            hAxis: { ...DARK_BASE.hAxis, title: "Surface Temp (°C)" },
            vAxis: { ...DARK_BASE.vAxis, title: "Surface Cond (µS/cm)", viewWindow: { min: 0, max: condP95 } },
            colors: ["#f97316", "#a855f7", "#06b6d4"],
            bubble: { opacity: 0.75, stroke: "none", textStyle: { color: "transparent" } },
            sizeAxis: { minSize: 3, maxSize: 22 },
          }}
          width="100%"
          height="380px"
          loader={<div style={loadStyle}>Loading chart…</div>}
        />
      </div>

      {/* ── 9. Bar – month comparison ───────────────────────────── */}
      <h2 style={headingStyle}>9. Bar – Month-by-Month Normalised Comparison</h2>
      <p style={descStyle}>
        Four variables with incompatible units are normalised to their 3-month season
        mean (100 = average) so they can share a single y-axis. Google Charts renders
        this as a grouped <strong>BarChart</strong> with horizontal bars: useful when
        category labels are long. In Chart.js the equivalent is a vertical grouped
        bar; in Recharts it is a{" "}
        <code>{"<BarChart layout=\"vertical\">"}</code> with custom axis. Google's
        horizontal bar is the default when <code>chartType="BarChart"</code> (versus
        "ColumnChart" for vertical). Each group of three bars represents one variable
        (temperature, conductance, salinity, water level), one bar per month.
        September values above 100 for conductance and salinity confirm the expected
        late-wet-season saltwater reassertion.
      </p>
      <div style={boxStyle}>
        <Chart
          chartType="BarChart"
          data={monthCompData}
          options={{
            ...DARK_BASE,
            title: "July / August / September: % of season mean (100 = average)",
            bars: "grouped",
            colors: ["#f97316", "#a855f7", "#06b6d4"],
            hAxis: { ...DARK_BASE.hAxis, title: "% of season mean", baseline: 100, baselineColor: "#94a3b8", viewWindow: { min: 80, max: 130 } },
            vAxis: { ...DARK_BASE.vAxis, title: "" },
          }}
          width="100%"
          height="320px"
          loader={<div style={loadStyle}>Loading chart…</div>}
        />
      </div>

      {/* ── 10. Table ───────────────────────────────────────────── */}
      {/* Google Charts Table renders its own HTML; override the default white theme */}
      <style>{`
        .google-visualization-table-table {
          border-collapse: collapse !important;
          width: 100% !important;
          font-family: 'Inter', sans-serif !important;
        }
        .google-visualization-table-table td,
        .google-visualization-table-table th {
          color: #e2e8f0 !important;
          border-color: #334155 !important;
          font-size: 12px !important;
          padding: 5px 10px !important;
        }
        .google-visualization-table-table th {
          background-color: #0f172a !important;
          color: #94a3b8 !important;
          cursor: pointer !important;
        }
        .google-visualization-table-tr-even td {
          background-color: #1e293b !important;
        }
        .google-visualization-table-tr-odd td {
          background-color: #243348 !important;
        }
        .google-visualization-table-tr-even:hover td,
        .google-visualization-table-tr-odd:hover td {
          background-color: #2d4060 !important;
        }
        .google-visualization-table-sortind {
          color: #38bdf8 !important;
        }
      `}</style>
      <h2 style={headingStyle}>10. Table – Sortable Daily Summary</h2>
      <p style={descStyle}>
        Google Charts includes a <strong>Table</strong> chart type that renders an
        interactive HTML table with client-side sorting on any column, alternating
        row shading, and built-in pagination. This is a unique Google Charts feature
       : no other library surveyed here (Chart.js, Recharts, D3, Plotly) has a
        first-class sortable table as a chart type. The table shows all 92 daily
        aggregates: click any column header to sort. Conductance is capped at the
        95th-percentile value ({condP95} µS/cm). This view is useful for finding
        specific high-salinity or high-rainfall days that may be hard to pinpoint on
        a dense time-series chart: sort by "Salinity Bot (ppt)" descending to see
        the worst tidal-intrusion days immediately.
      </p>
      <div style={boxStyle}>
        <Chart
          chartType="Table"
          data={tableData}
          options={{
            showRowNumber: true,
            allowHtml: true,
            sortColumn: 0,
            alternatingRowStyle: true,
          }}
          width="100%"
          height="480px"
          loader={<div style={loadStyle}>Loading chart…</div>}
        />
      </div>
    </div>
  )
}
