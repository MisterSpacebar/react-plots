import { useData } from "../DataContext"
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
  ScatterChart,
  Scatter,
  AreaChart,
  Area,
  RadialBarChart,
  RadialBar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Brush,
  ReferenceLine,
  ReferenceArea,
  ErrorBar,
  Cell,
  LabelList,
  ResponsiveContainer,
} from "recharts"

// ─── helpers ────────────────────────────────────────────────────────────────

function avg(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length
}
function stddev(arr) {
  if (arr.length < 2) return 0
  const m = avg(arr)
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length)
}

// Build daily aggregate objects (Recharts wants array-of-objects, not parallel arrays)
function buildDailyData(records) {
  const map = {}
  for (const r of records) {
    if (!map[r.date]) {
      const mm = r.date.slice(5, 7)
      map[r.date] = {
        date: r.date,
        label: r.date.slice(5), // "MM-DD" for axis ticks
        month: mm === "07" ? "July" : mm === "08" ? "August" : "September",
        rainfall: 0,
        levels: [],
        tempTop: [],
        tempBottom: [],
        conductTop: [],
        conductBottom: [],
        salinityBottom: [],
      }
    }
    const d = map[r.date]
    d.rainfall = Math.max(d.rainfall, r.rainfall_in ?? 0)
    if (r.water_level_ft != null) d.levels.push(r.water_level_ft)
    if (r.temp_top_c != null && r.temp_top_c >= 15) d.tempTop.push(r.temp_top_c)
    if (r.temp_bottom_c != null && r.temp_bottom_c >= 15) d.tempBottom.push(r.temp_bottom_c)
    if (r.conductance_top_us_cm != null) d.conductTop.push(r.conductance_top_us_cm)
    if (r.conductance_bottom_us_cm != null) d.conductBottom.push(r.conductance_bottom_us_cm)
    if (r.salinity_bottom_ppt != null) d.salinityBottom.push(r.salinity_bottom_ppt)
  }
  return Object.values(map)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      date: d.date,
      label: d.label,
      month: d.month,
      maxRain: +d.rainfall.toFixed(2),
      meanLevel: d.levels.length ? +avg(d.levels).toFixed(3) : null,
      meanTempTop: d.tempTop.length ? +avg(d.tempTop).toFixed(2) : null,
      meanTempBottom: d.tempBottom.length ? +avg(d.tempBottom).toFixed(2) : null,
      meanConductTop: d.conductTop.length ? +avg(d.conductTop).toFixed(1) : null,
      meanConductBottom: d.conductBottom.length ? +avg(d.conductBottom).toFixed(1) : null,
      meanSalinity: d.salinityBottom.length ? +avg(d.salinityBottom).toFixed(4) : null,
    }))
}

// 7-day rolling windows for the ErrorBar chart
function buildWeeklyStats(daily) {
  const weeks = []
  for (let i = 0; i < daily.length; i += 7) {
    const chunk = daily.slice(i, i + 7)
    const levels = chunk.map((d) => d.meanLevel).filter((v) => v != null)
    const temps = chunk.map((d) => d.meanTempTop).filter((v) => v != null)
    weeks.push({
      label: chunk[0].label, // "MM-DD" of week start
      meanLevel: levels.length ? +avg(levels).toFixed(3) : null,
      levelError: levels.length > 1 ? +stddev(levels).toFixed(3) : 0,
      meanTemp: temps.length ? +avg(temps).toFixed(2) : null,
      tempError: temps.length > 1 ? +stddev(temps).toFixed(3) : 0,
    })
  }
  return weeks
}

// Sample every 8th record, split by month for scatter coloring
function buildScatterByMonth(records) {
  const result = { July: [], August: [], September: [] }
  const nameByMM = { "07": "July", "08": "August", "09": "September" }
  records.forEach((r, i) => {
    if (i % 8 !== 0) return
    if (r.water_level_ft == null || r.conductance_top_us_cm == null) return
    if (r.temp_top_c == null || r.temp_top_c < 15) return
    const month = nameByMM[r.date.slice(5, 7)]
    if (!month) return
    result[month].push({
      waterLevel: r.water_level_ft,
      conductance: r.conductance_top_us_cm,
      temp: r.temp_top_c,
      date: r.date,
    })
  })
  return result
}

// 24-hour temperature buckets for RadialBarChart: with neighbor interpolation for empty hours
function buildHourlyTemp(records) {
  const buckets = Array.from({ length: 24 }, () => [])
  for (const r of records) {
    const hour = r.datetime.toDate().getHours()
    if (r.temp_top_c != null && r.temp_top_c >= 15) buckets[hour].push(r.temp_top_c)
  }
  const raw = buckets.map((b, i) => ({
    hour: `${String(i).padStart(2, "0")}:00`,
    avgTemp: b.length ? +avg(b).toFixed(2) : null,
  }))
  const interp = raw.map((b, i) => {
    if (b.avgTemp != null) return b
    let prev = null, next = null
    for (let d = 1; d < 24; d++) {
      if (prev == null && raw[(i - d + 24) % 24].avgTemp != null) prev = raw[(i - d + 24) % 24].avgTemp
      if (next == null && raw[(i + d) % 24].avgTemp != null) next = raw[(i + d) % 24].avgTemp
      if (prev != null && next != null) break
    }
    const val = prev != null && next != null ? (prev + next) / 2 : (prev ?? next)
    return { ...b, avgTemp: val != null ? +val.toFixed(2) : null }
  })
  const minTemp = Math.min(...interp.map(b => b.avgTemp).filter(v => v != null))
  return interp.map(b => ({
    ...b,
    name: b.hour,
    tempAboveMin: b.avgTemp != null ? +(b.avgTemp - minTemp).toFixed(3) : 0,
  }))
}

// Daily 5-day rolling mean residual: green/red/neutral regime per day for Cell coloring
function buildFlowRegime(daily) {
  const N = daily.length
  const HALF = 2
  const baseline = daily.map((_, i) => {
    const from = Math.max(0, i - HALF)
    const to = Math.min(N - 1, i + HALF)
    const vals = daily.slice(from, to + 1).map(d => d.meanLevel).filter(v => v != null)
    return vals.length ? avg(vals) : null
  })
  const THRESH = 0.01
  return daily.map((d, i) => {
    const res = d.meanLevel != null && baseline[i] != null ? +(d.meanLevel - baseline[i]).toFixed(3) : 0
    return {
      label: d.label,
      date: d.date,
      residual: res,
      regime: res > THRESH ? "drainage" : res < -THRESH ? "backpressure" : "neutral",
    }
  })
}

// Merge consecutive rainy days into contiguous ReferenceArea bands
function getStormPeriods(daily) {
  const periods = []
  let start = null
  for (let i = 0; i < daily.length; i++) {
    if (daily[i].maxRain >= 0.5) {
      if (start == null) start = daily[i].label
    } else {
      if (start != null) {
        periods.push({ x1: start, x2: daily[i - 1].label })
        start = null
      }
    }
  }
  if (start != null) periods.push({ x1: start, x2: daily[daily.length - 1].label })
  return periods
}

// ─── custom tooltip component rendered as full React JSX ─────────────────────
function ScatterTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div
      style={{
        background: "#1e293b",
        border: "1px solid #475569",
        padding: "8px 12px",
        borderRadius: 6,
        fontSize: 13,
        lineHeight: "1.7",
      }}
    >
      <p style={{ color: "#94a3b8", margin: 0, fontWeight: 600 }}>{d.date}</p>
      <p style={{ color: "#34d399", margin: 0 }}>Water Level: {d.waterLevel} ft NGVD29</p>
      <p style={{ color: "#f59e0b", margin: 0 }}>
        Conductance: {d.conductance.toLocaleString()} uS/cm
      </p>
      <p style={{ color: "#f97316", margin: 0 }}>Temp (top): {d.temp} C</p>
    </div>
  )
}

// ─── page ────────────────────────────────────────────────────────────────────

export default function RechartsPage() {
  const { records, loading, error } = useData()
  if (loading) return <p className="status">Loading all 3 months of data...</p>
  if (error) return <p className="status error">Error: {error}</p>

  const daily = buildDailyData(records)
  const weekly = buildWeeklyStats(daily)
  const scatter = buildScatterByMonth(records)
  const stormPeriods = getStormPeriods(daily)

  // p95 cap for conductance y-axis (suppresses saltwater pulse outlier)
  const allConduct = daily
    .flatMap((d) => [d.meanConductTop, d.meanConductBottom])
    .filter((v) => v != null)
    .sort((a, b) => a - b)
  const conductYMax =
    Math.ceil((allConduct[Math.floor(allConduct.length * 0.95)] ?? allConduct[allConduct.length - 1]) / 100) * 100

  const maxSalinity = Math.max(...daily.map((d) => d.meanSalinity ?? 0))
  const salinityYMax = Math.max(Math.ceil(maxSalinity * 10) / 10, 3)

  // Tick skip so ~10 labels appear across the 92-day x-axis
  const tickInterval = Math.floor(daily.length / 10)

  // Charts 6-10 data
  const flowRegime = buildFlowRegime(daily)
  const hourlyTemp = buildHourlyTemp(records)
  const topStorms = [...daily]
    .filter(d => d.maxRain >= 0.5)
    .sort((a, b) => b.maxRain - a.maxRain)
    .slice(0, 10)

  return (
    <div className="chart-page">
      <h1>Recharts</h1>
      <p>
        Full 3 months &middot; daily aggregates &middot; USGS site 2286328 &middot;{" "}
        <strong>
          Hover any synced panel to highlight the same day across all three &middot; drag the Brush
          to select a time window
        </strong>
      </p>
      <p className="section-desc" style={{ marginTop: "0.5rem" }}>
        Recharts renders every chart element (axes, lines, areas, tooltips, and reference overlays) as
        true React SVG components. Because each primitive is a typed JSX element, charts compose and
        extend naturally inside a React codebase without reaching for imperative DOM APIs. All data
        flows through React state; chart updates happen through a standard re-render cycle rather than
        an external chart instance.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", margin: "0.75rem 0 0.5rem", fontSize: "0.82rem" }}>
        <div>
          <div style={{ color: "#34d399", fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Strengths</div>
          <ul style={{ margin: 0, paddingLeft: "1.15rem", color: "#94a3b8", lineHeight: 1.5 }}>
            <li>True React component model: every axis, line, tooltip, and brush is a composable JSX element</li>
            <li><code>syncId</code> links tooltip and zoom cursor across completely separate chart components</li>
            <li>SVG output is accessible, easily styled with CSS, printable, and inspectable in DevTools</li>
            <li><code>ErrorBar</code>, <code>ReferenceArea</code>, <code>ReferenceLine</code>, and <code>Brush</code> are built-in primitives</li>
          </ul>
        </div>
        <div>
          <div style={{ color: "#f87171", fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Limitations</div>
          <ul style={{ margin: 0, paddingLeft: "1.15rem", color: "#94a3b8", lineHeight: 1.5 }}>
            <li>SVG DOM performance degrades at very large point counts: thousands of rendered elements in the tree</li>
            <li>No 3-D, Sankey, parallel coordinates, treemap, or other exotic chart types</li>
            <li>Animation system is less configurable than ECharts or Plotly</li>
            <li>Deep customization often requires reimplementing chart primitives from scratch</li>
          </ul>
        </div>
      </div>

      {/* ── 1. syncId + Brush ──────────────────────────────────────────────── */}
      <h2 className="section-heading">1. Synchronized Multi-Variable Overview (syncId + Brush)</h2>
      <p className="section-desc">
        Three separate <code>LineChart</code> components share <code>syncId="canal"</code>. Hovering any
        panel snaps a tooltip cursor to the same date in all three simultaneously. The Brush on the
        temperature panel also zooms all three panels: impossible to replicate cleanly in Chart.js
        without a custom plugin.
      </p>
      <section className="chart-section" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 12, color: "#94a3b8", paddingLeft: 56 }}>Temperature (C)</div>
        <ResponsiveContainer width="100%" height={190}>
          <LineChart data={daily} syncId="canal" margin={{ top: 4, right: 24, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="date" hide />
            <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} width={42} />
            <Tooltip
              labelFormatter={(l) => l}
              formatter={(v, name) => [v != null ? `${v} C` : "n/a", name]}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="meanTempTop"
              stroke="#f97316"
              dot={false}
              name="Temp Top (C)"
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="meanTempBottom"
              stroke="#3b82f6"
              dot={false}
              name="Temp Bottom (C)"
              connectNulls
            />
            <Brush dataKey="date" height={22} stroke="#4b5563" fill="#1e293b" travellerWidth={6} />
          </LineChart>
        </ResponsiveContainer>

        <div style={{ fontSize: 12, color: "#94a3b8", paddingLeft: 56 }}>Water Level (ft)</div>
        <ResponsiveContainer width="100%" height={130}>
          <LineChart data={daily} syncId="canal" margin={{ top: 4, right: 24, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="date" hide />
            <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} width={42} />
            <Tooltip
              labelFormatter={(l) => l}
              formatter={(v, name) => [v != null ? `${v} ft` : "n/a", name]}
            />
            <Line
              type="monotone"
              dataKey="meanLevel"
              stroke="#34d399"
              dot={false}
              name="Water Level (ft)"
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>

        <div style={{ fontSize: 12, color: "#94a3b8", paddingLeft: 56 }}>Conductance (uS/cm)</div>
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={daily} syncId="canal" margin={{ top: 4, right: 24, left: 10, bottom: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10 }}
              interval={tickInterval}
              angle={-30}
              textAnchor="end"
            />
            <YAxis domain={[0, conductYMax]} tick={{ fontSize: 11 }} width={42} />
            <Tooltip
              labelFormatter={(l) => l}
              formatter={(v, name) => [v != null ? `${v} uS/cm` : "n/a", name]}
            />
            <Line
              type="monotone"
              dataKey="meanConductTop"
              stroke="#f59e0b"
              dot={false}
              name="Conduct Top"
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="meanConductBottom"
              stroke="#ec4899"
              dot={false}
              name="Conduct Bottom"
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </section>

      {/* ── 2. ComposedChart + ReferenceArea storm windows ─────────────────── */}
      <h2 className="section-heading">2. Composed Chart: Storm Windows as ReferenceArea</h2>
      <p className="section-desc">
        Orange bands mark consecutive days with rainfall {">"}= 0.5 in. Each band is a single{" "}
        <code>{"<ReferenceArea x1={...} x2={...} />"}</code> JSX element: no custom plugin, no canvas
        hack. Chart.js would require either a custom plugin or post-render DOM manipulation to achieve the
        same effect.
      </p>
      <section className="chart-section">
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={daily} margin={{ top: 10, right: 60, left: 10, bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10 }}
              interval={tickInterval}
              angle={-30}
              textAnchor="end"
            />
            <YAxis
              yAxisId="yRain"
              orientation="left"
              domain={[0, "auto"]}
              tick={{ fontSize: 11 }}
              width={42}
              label={{
                value: "Rainfall (in)",
                angle: -90,
                position: "insideLeft",
                offset: 10,
                style: { fontSize: 11 },
              }}
            />
            <YAxis
              yAxisId="yLevel"
              orientation="right"
              domain={["auto", "auto"]}
              tick={{ fontSize: 11 }}
              width={52}
              label={{
                value: "Water Level (ft)",
                angle: 90,
                position: "insideRight",
                offset: 10,
                style: { fontSize: 11 },
              }}
            />
            <Tooltip
              formatter={(v, name) => {
                if (name === "Rainfall (in)") return [`${v} in`, name]
                if (name === "Water Level (ft)") return [`${v} ft`, name]
                return [v, name]
              }}
            />
            <Legend />
            {stormPeriods.map((p, i) => (
              <ReferenceArea
                key={i}
                x1={p.x1}
                x2={p.x2}
                yAxisId="yRain"
                fill="rgba(251,146,60,0.18)"
                stroke="rgba(251,146,60,0.5)"
                strokeWidth={1}
              />
            ))}
            <Bar
              yAxisId="yRain"
              dataKey="maxRain"
              fill="#60a5fa"
              opacity={0.75}
              name="Rainfall (in)"
            />
            <Line
              yAxisId="yLevel"
              type="monotone"
              dataKey="meanLevel"
              stroke="#34d399"
              dot={false}
              strokeWidth={2}
              name="Water Level (ft)"
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </section>

      {/* ── 3. Salinity with threshold ReferenceArea bands ─────────────────── */}
      <h2 className="section-heading">3. Area Chart: Salinity Zones as Horizontal ReferenceArea Bands</h2>
      <p className="section-desc">
        Fixed-y <code>ReferenceArea</code> components create background color bands for ecological
        salinity zones (green = freshwater {"<"} 0.5 ppt, yellow = brackish 0.5-2 ppt, red = saline{" "}
        {">"} 2 ppt). This replaces a series of invisible "fake" datasets that Chart.js requires to
        achieve the same background coloring.
      </p>
      <section className="chart-section">
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={daily} margin={{ top: 10, right: 120, left: 10, bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10 }}
              interval={tickInterval}
              angle={-30}
              textAnchor="end"
            />
            <YAxis domain={[0, salinityYMax]} tick={{ fontSize: 11 }} width={42} />
            <Tooltip formatter={(v, name) => [v != null ? `${v} ppt` : "n/a", name]} />
            <Legend />
            {/* Ecological threshold bands: pure declarative JSX */}
            <ReferenceArea y1={0} y2={0.5} fill="rgba(34,197,94,0.12)" ifOverflow="hidden" />
            <ReferenceArea y1={0.5} y2={2} fill="rgba(251,191,36,0.12)" ifOverflow="hidden" />
            <ReferenceArea
              y1={2}
              y2={salinityYMax}
              fill="rgba(239,68,68,0.12)"
              ifOverflow="hidden"
            />
            <ReferenceLine
              y={0.5}
              stroke="#22c55e"
              strokeDasharray="4 2"
              label={{ value: "0.5 ppt: freshwater", position: "right", fontSize: 10, fill: "#22c55e" }}
            />
            <ReferenceLine
              y={2}
              stroke="#ef4444"
              strokeDasharray="4 2"
              label={{ value: "2.0 ppt: saline", position: "right", fontSize: 10, fill: "#ef4444" }}
            />
            <Area
              type="monotone"
              dataKey="meanSalinity"
              stroke="#0ea5e9"
              fill="rgba(14,165,233,0.25)"
              name="Salinity Bottom (ppt)"
              dot={false}
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>
      </section>

      {/* ── 4. ErrorBar on weekly water level ─────────────────────────────── */}
      <h2 className="section-heading">4. Weekly Water Level with ErrorBar (std dev)</h2>
      <p className="section-desc">
        <code>{"<ErrorBar>"}</code> renders +/- 1 standard deviation whiskers natively on any Bar: no
        custom plugin required. Chart.js has no equivalent. Taller whiskers indicate more variable weeks,
        typically those containing large storm events.
      </p>
      <section className="chart-section">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={weekly} margin={{ top: 10, right: 24, left: 10, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10 }}
              angle={-40}
              textAnchor="end"
              interval={0}
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fontSize: 11 }}
              width={42}
              label={{
                value: "Water Level (ft)",
                angle: -90,
                position: "insideLeft",
                offset: 10,
                style: { fontSize: 11 },
              }}
            />
            <Tooltip formatter={(v, name) => [v != null ? `${v} ft` : "n/a", name]} />
            <Legend />
            <Bar dataKey="meanLevel" fill="#3b82f6" name="Weekly Mean Water Level (ft)">
              <ErrorBar
                dataKey="levelError"
                width={5}
                strokeWidth={1.5}
                stroke="#93c5fd"
                direction="y"
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </section>

      {/* ── 5. Scatter with custom React tooltip ──────────────────────────── */}
      <h2 className="section-heading">5. Scatter: Custom React Component Tooltip by Month</h2>
      <p className="section-desc">
        Recharts tooltips accept any React component via <code>{"<Tooltip content={<MyTooltip />}>"}</code>.
        The tooltip here renders a formatted data card with units, color-coded fields, and full date --
        compared to Chart.js where custom tooltips require low-level canvas drawing callbacks.
        Points are colored by month to reveal seasonal shifts in the water-level/conductance relationship.
      </p>
      <section className="chart-section">
        <ResponsiveContainer width="100%" height={340}>
          <ScatterChart margin={{ top: 10, right: 24, left: 10, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              type="number"
              dataKey="waterLevel"
              name="Water Level"
              domain={["auto", "auto"]}
              tick={{ fontSize: 11 }}
              label={{
                value: "Water Level (ft NGVD29)",
                position: "insideBottom",
                offset: -20,
                style: { fontSize: 11 },
              }}
            />
            <YAxis
              type="number"
              dataKey="conductance"
              name="Conductance"
              domain={[0, conductYMax]}
              tick={{ fontSize: 11 }}
              width={52}
              label={{
                value: "Conductance Top (uS/cm)",
                angle: -90,
                position: "insideLeft",
                offset: 10,
                style: { fontSize: 11 },
              }}
            />
            <Tooltip content={<ScatterTooltip />} />
            <Legend />
            <Scatter name="July" data={scatter.July} fill="#f97316" opacity={0.6} />
            <Scatter name="August" data={scatter.August} fill="#8b5cf6" opacity={0.6} />
            <Scatter name="September" data={scatter.September} fill="#06b6d4" opacity={0.6} />
          </ScatterChart>
        </ResponsiveContainer>
      </section>

      {/* ── 6. SVG gradient AreaChart ─────────────────────────────────────── */}
      <h2 className="section-heading">6. SVG Gradient Area: Temperature Seasonal Trend</h2>
      <p className="section-desc">
        The orange-to-blue gradient fill is defined as a pure SVG{" "}
        <code>{"<defs><linearGradient>"}</code> element nested directly inside the{" "}
        <code>AreaChart</code>: this is only possible in SVG-based libraries.
        Canvas-based Chart.js cannot fill an area with a gradient that responds to the chart
        coordinate system without a custom plugin. The gradient visually reinforces
        the warmest (orange top) and coolest (blue bottom) temperature range.
      </p>
      <section className="chart-section">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={daily} margin={{ top: 10, right: 24, left: 10, bottom: 30 }}>
            <defs>
              <linearGradient id="tempAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fb923c" stopOpacity={0.9} />
                <stop offset="45%" stopColor="#fbbf24" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.04} />
              </linearGradient>
              <linearGradient id="tempBotGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={tickInterval} angle={-30} textAnchor="end" />
            <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} width={42} />
            <Tooltip formatter={(v, name) => [v != null ? `${v} C` : "n/a", name]} />
            <Legend />
            <Area
              type="monotone"
              dataKey="meanTempTop"
              stroke="#f97316"
              strokeWidth={1.5}
              fill="url(#tempAreaGrad)"
              name="Daily Mean Temp Top (C)"
              dot={false}
              connectNulls
            />
            <Area
              type="monotone"
              dataKey="meanTempBottom"
              stroke="#3b82f6"
              strokeWidth={1}
              fill="url(#tempBotGrad)"
              name="Daily Mean Temp Bottom (C)"
              dot={false}
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>
      </section>

      {/* ── 7. Cell-colored flow regime ───────────────────────────────────── */}
      <h2 className="section-heading">7. Cell-Colored Bar: Day-by-Day Flow Regime</h2>
      <p className="section-desc">
        Each bar is the daily water level anomaly vs its 5-day rolling mean, individually
        colored via a <code>{"<Cell>"}</code> child element: green when the canal is draining
        above baseline (freshwater head dominant), red when below (tidal backpressure or
        drainage deficit), gray when near-neutral. In Chart.js, per-bar colors require either
        a separate dataset per color or a backgroundColor array; Recharts{" "}
        <code>Cell</code> is cleaner and naturally maps coloring to data semantics.
      </p>
      <section className="chart-section">
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={flowRegime} margin={{ top: 10, right: 24, left: 10, bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={tickInterval} angle={-30} textAnchor="end" />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fontSize: 11 }}
              width={52}
              label={{ value: "Level Anomaly (ft)", angle: -90, position: "insideLeft", offset: 10, style: { fontSize: 11 } }}
            />
            <Tooltip labelFormatter={l => l} formatter={(v) => [`${v} ft`, "Level Anomaly"]} />
            <Legend
              payload={[
                { value: "Drainage dominant", type: "rect", color: "#16a34a" },
                { value: "Backpressure / deficit", type: "rect", color: "#f87171" },
                { value: "Near-neutral", type: "rect", color: "#475569" },
              ]}
            />
            <ReferenceLine y={0} stroke="#f59e0b" strokeDasharray="5 2" strokeWidth={1.5} />
            <Bar dataKey="residual" name="Regime" maxBarSize={10} isAnimationActive={false}>
              {flowRegime.map((entry, index) => (
                <Cell
                  key={`rc-${index}`}
                  fill={
                    entry.regime === "drainage"
                      ? "#16a34a"
                      : entry.regime === "backpressure"
                      ? "#f87171"
                      : "#475569"
                  }
                />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </section>

      {/* ── 8. RadialBarChart diurnal ─────────────────────────────────────── */}
      <h2 className="section-heading">8. RadialBarChart: Diurnal Temperature Anomaly</h2>
      <p className="section-desc">
        <code>RadialBarChart</code> is a first-class Recharts chart type with no Chart.js
        equivalent. Each bar represents one hour-of-day (00:00 at top, clockwise), and its
        length shows how much warmer that hour is compared to the coolest hour of the day
        averaged across 92 days. The small inner ring = the cool pre-dawn minimum;
        the long bars around 14:00-16:00 = peak afternoon solar heating.
        Colors progress through the same 24-hour rainbow as the polar area chart to aid comparison.
      </p>
      <section className="chart-section polar-section">
        <ResponsiveContainer width="100%" height={380}>
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="12%"
            outerRadius="88%"
            data={hourlyTemp}
            startAngle={90}
            endAngle={-270}
          >
            <RadialBar
              dataKey="tempAboveMin"
              background={{ fill: "#1f2937" }}
              isAnimationActive={false}
              label={false}
            >
              {hourlyTemp.map((entry, index) => (
                <Cell key={`rb-${index}`} fill={`hsla(${(index / 24) * 270}, 70%, 60%, 0.9)`} />
              ))}
            </RadialBar>
            <Tooltip
              formatter={(v, _name, props) => [
                `${props.payload.avgTemp} C avg  (+${v} C above min)`,
                props.payload.hour,
              ]}
            />
            <Legend
              iconSize={0}
              payload={[{
                value: "Bar length = degrees C above the coolest hour of the day (avg across 92 days)",
                type: "circle",
                color: "#94a3b8",
              }]}
            />
          </RadialBarChart>
        </ResponsiveContainer>
      </section>

      {/* ── 9. Custom SVG dot property ────────────────────────────────────── */}
      <h2 className="section-heading">9. Custom SVG Dots: Tidal Intrusion Events Marked</h2>
      <p className="section-desc">
        The <code>dot</code> prop on any Recharts <code>Area</code> or <code>Line</code> accepts
        a full React render function that returns arbitrary SVG: here, a red upward triangle
        is drawn for each day where bottom salinity exceeds 1 ppt (saltwater intrusion event),
        sized proportionally to the salinity value. Days below 1 ppt render nothing.
        Chart.js requires low-level canvas <code>draw</code> callbacks in a custom plugin to
        achieve the same effect; Recharts treats it as standard JSX.
      </p>
      <section className="chart-section">
        <ResponsiveContainer width="100%" height={270}>
          <AreaChart data={daily} margin={{ top: 16, right: 120, left: 10, bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={tickInterval} angle={-30} textAnchor="end" />
            <YAxis domain={[0, salinityYMax]} tick={{ fontSize: 11 }} width={42} />
            <Tooltip formatter={(v, name) => [v != null ? `${v} ppt` : "n/a", name]} />
            <Legend />
            <ReferenceArea y1={0} y2={0.5} fill="rgba(34,197,94,0.1)" ifOverflow="hidden" />
            <ReferenceArea y1={0.5} y2={2} fill="rgba(251,191,36,0.08)" ifOverflow="hidden" />
            <ReferenceArea y1={2} y2={salinityYMax} fill="rgba(239,68,68,0.08)" ifOverflow="hidden" />
            <ReferenceLine
              y={0.5}
              stroke="#22c55e"
              strokeDasharray="4 2"
              label={{ value: "0.5 ppt: freshwater", position: "right", fontSize: 10, fill: "#22c55e" }}
            />
            <ReferenceLine
              y={2}
              stroke="#ef4444"
              strokeDasharray="4 2"
              label={{ value: "2.0 ppt: saline", position: "right", fontSize: 10, fill: "#ef4444" }}
            />
            <Area
              type="monotone"
              dataKey="meanSalinity"
              stroke="#0ea5e9"
              fill="rgba(14,165,233,0.15)"
              name="Salinity Bottom (ppt)"
              connectNulls
              activeDot={{ r: 4, fill: "#0ea5e9" }}
              dot={(props) => {
                const { cx, cy, payload } = props
                if (!payload.meanSalinity || payload.meanSalinity < 1) return null
                const sz = Math.min(10, 5 + (payload.meanSalinity - 1) * 2.5)
                const pts =
                  cx + "," + (cy - sz) + " " +
                  (cx - sz * 0.8) + "," + (cy + sz * 0.55) + " " +
                  (cx + sz * 0.8) + "," + (cy + sz * 0.55)
                return (
                  <polygon
                    key={`sdot-${cx}-${cy}`}
                    points={pts}
                    fill="#ef4444"
                    stroke="#fca5a5"
                    strokeWidth={1}
                  />
                )
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </section>

      {/* ── 10. Vertical bar with LabelList ───────────────────────────────── */}
      <h2 className="section-heading">10. Horizontal Bar + LabelList: Top 10 Storm Events</h2>
      <p className="section-desc">
        <code>layout="vertical"</code> flips BarChart axes so categories run top-to-bottom --
        ideal for labeled rankings. <code>{"<LabelList>"}</code> places inline text annotations
        at the end of each bar showing the exact rainfall amount, eliminating the need to read
        the x-axis for every individual bar. Both are declarative one-prop changes; no plugin
        needed. Bars are sorted by descending magnitude to read as a ranked list.
      </p>
      <section className="chart-section">
        <ResponsiveContainer width="100%" height={310}>
          <BarChart
            layout="vertical"
            data={topStorms}
            margin={{ top: 10, right: 75, left: 55, bottom: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
            <XAxis type="number" domain={[0, "auto"]} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={50} />
            <Tooltip formatter={(v) => [`${v} in`, "Rainfall"]} />
            <Bar dataKey="maxRain" name="Rainfall (in)" radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {topStorms.map((entry, index) => (
                <Cell
                  key={`storm-${index}`}
                  fill={`hsl(${210 + index * 8}, 70%, ${55 - index * 2}%)`}
                />
              ))}
              <LabelList
                dataKey="maxRain"
                position="right"
                style={{ fontSize: 11, fill: "#e2e8f0" }}
                formatter={(v) => v + " in"}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </section>
    </div>
  )
}
