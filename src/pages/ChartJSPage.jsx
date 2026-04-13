import { useRef } from "react"
import { useData } from "../DataContext"
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  RadialLinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ScatterController,
  RadarController,
  PolarAreaController,
} from "chart.js"
import zoomPlugin from "chartjs-plugin-zoom"
import { Line, Bar, Chart, Scatter, Radar, PolarArea, Bubble, Doughnut } from "react-chartjs-2"

ChartJS.register(
  CategoryScale,
  LinearScale,
  RadialLinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ScatterController,
  RadarController,
  PolarAreaController,
  zoomPlugin
)

function avg(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

function stddev(arr) {
  if (!arr.length) return null
  const m = avg(arr)
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length)
}

function buildDailyAggregates(records) {
  const map = {}
  for (const r of records) {
    if (!map[r.date]) {
      map[r.date] = { rainfall: 0, levels: [], conductTop: [], conductBottom: [] }
    }
    map[r.date].rainfall = Math.max(map[r.date].rainfall, r.rainfall_in ?? 0)
    if (r.water_level_ft != null) map[r.date].levels.push(r.water_level_ft)
    if (r.conductance_top_us_cm != null) map[r.date].conductTop.push(r.conductance_top_us_cm)
    if (r.conductance_bottom_us_cm != null) map[r.date].conductBottom.push(r.conductance_bottom_us_cm)
  }
  const dates = Object.keys(map).sort()
  return {
    dates,
    rainfall: dates.map((d) => map[d].rainfall),
    meanLevel: dates.map((d) => (map[d].levels.length ? +avg(map[d].levels).toFixed(3) : null)),
    meanConductTop: dates.map((d) => (map[d].conductTop.length ? +avg(map[d].conductTop).toFixed(1) : null)),
    meanConductBottom: dates.map((d) => (map[d].conductBottom.length ? +avg(map[d].conductBottom).toFixed(1) : null)),
  }
}

function buildDiurnal(records) {
  const buckets = Array.from({ length: 24 }, () => ({ temps: [], salinities: [], levels: [] }))
  for (const r of records) {
    const hour = r.datetime.toDate().getHours()
    if (r.temp_top_c != null) buckets[hour].temps.push(r.temp_top_c)
    if (r.salinity_top_ppt != null) buckets[hour].salinities.push(r.salinity_top_ppt)
    if (r.water_level_ft != null) buckets[hour].levels.push(r.water_level_ft)
  }
  // Compute raw averages first, then interpolate any empty temperature buckets
  // (e.g. a USGS sensor gap at a specific hour across all days)
  const rawTemp = buckets.map((b) => (b.temps.length ? avg(b.temps) : null))
  const rawStdDev = buckets.map((b) => (b.temps.length ? stddev(b.temps) : null))
  const interpTemp = rawTemp.map((v, i) => {
    if (v != null) return +v.toFixed(3)
    // find nearest non-null neighbors, wrapping around the 24-hour circle
    let prev = null, next = null
    for (let d = 1; d < 24; d++) {
      if (prev == null && rawTemp[(i - d + 24) % 24] != null) prev = rawTemp[(i - d + 24) % 24]
      if (next == null && rawTemp[(i + d) % 24] != null) next = rawTemp[(i + d) % 24]
      if (prev != null && next != null) break
    }
    const val = prev != null && next != null ? (prev + next) / 2 : (prev ?? next)
    return val != null ? +val.toFixed(3) : null
  })
  const interpStdDev = rawStdDev.map((v, i) => {
    if (v != null) return +v.toFixed(3)
    let prev = null, next = null
    for (let d = 1; d < 24; d++) {
      if (prev == null && rawStdDev[(i - d + 24) % 24] != null) prev = rawStdDev[(i - d + 24) % 24]
      if (next == null && rawStdDev[(i + d) % 24] != null) next = rawStdDev[(i + d) % 24]
      if (prev != null && next != null) break
    }
    const val = prev != null && next != null ? (prev + next) / 2 : (prev ?? next)
    return val != null ? +val.toFixed(3) : null
  })
  return {
    hours: buckets.map((_, i) => `${String(i).padStart(2, "0")}:00`),
    temp: interpTemp,
    tempStdDev: interpStdDev,
    salinity: buckets.map((b) => (b.salinities.length ? +avg(b.salinities).toFixed(4) : null)),
    level: buckets.map((b) => (b.levels.length ? +avg(b.levels).toFixed(4) : null)),
  }
}

// Returns per-record stratification metrics and salinity for the two new time-series charts
function buildStratification(records) {
  const labels = records.map((r) =>
    r.datetime.toDate().toISOString().slice(0, 16).replace("T", " ")
  )
  const tempDiff = records.map((r) =>
    r.temp_top_c != null && r.temp_bottom_c != null
      ? +(r.temp_top_c - r.temp_bottom_c).toFixed(3)
      : null
  )
  const conductDiff = records.map((r) =>
    r.conductance_bottom_us_cm != null && r.conductance_top_us_cm != null
      ? +(r.conductance_bottom_us_cm - r.conductance_top_us_cm).toFixed(1)
      : null
  )
  const salinityBottom = records.map((r) => r.salinity_bottom_ppt ?? null)
  return { labels, tempDiff, conductDiff, salinityBottom }
}

// Mean canal water level at 0-7 day lags from rain events; dry-day baseline for comparison
function buildRainfallMemory(dailyRain, dailyLevel) {
  const THRESHOLD = 0.5
  const MAX_LAG = 7
  const dryVals = dailyLevel.filter((l, i) => {
    if (l == null) return false
    for (let b = 0; b <= MAX_LAG; b++) {
      if (i - b >= 0 && dailyRain[i - b] >= THRESHOLD) return false
    }
    return true
  })
  const dryBase = dryVals.length ? +(avg(dryVals)).toFixed(3) : null
  const lagLabels = [
    "Rain day", "1 day later", "2 days later", "3 days later",
    "4 days later", "5 days later", "6 days later", "7 days later",
  ]
  const lagMeans = Array.from({ length: MAX_LAG + 1 }, (_, lag) => {
    const vals = []
    for (let i = lag; i < dailyRain.length; i++) {
      if (dailyRain[i - lag] >= THRESHOLD && dailyLevel[i] != null) vals.push(dailyLevel[i])
    }
    return vals.length >= 3 ? +(avg(vals)).toFixed(3) : null
  })
  return { lagLabels, lagMeans, dryBase }
}

// 5-day centered rolling mean as local baseline; residual = daily mean level - baseline
function buildFlowAnomaly(dailyDates, dailyLevel, dailyRain) {
  const N = dailyLevel.length
  const HALF = 2
  const baseline = dailyLevel.map((_, i) => {
    const from = Math.max(0, i - HALF)
    const to = Math.min(N - 1, i + HALF)
    const vals = dailyLevel.slice(from, to + 1).filter((v) => v != null)
    return vals.length ? avg(vals) : null
  })
  const residuals = dailyLevel.map((l, i) =>
    l != null && baseline[i] != null ? +(l - baseline[i]).toFixed(3) : null
  )
  const validRain = dailyRain.filter((r) => r != null && r > 0)
  const maxRain = validRain.length ? Math.max(...validRain) : 1
  const scale = 0.15 / maxRain
  return {
    dates: dailyDates,
    drainage: residuals.map((r) => (r != null && r > 0 ? r : 0)),
    backpressure: residuals.map((r) => (r != null && r < 0 ? r : 0)),
    rainfallScaled: dailyRain.map((r) => (r != null ? +(-r * scale).toFixed(3) : 0)),
  }
}

// Aligns each storm event (daily rainfall >= 0.5 in) on a common -24h to +72h time axis
function buildStormComposite(records, stormDates) {
  const dateIndex = new Map()
  for (let i = 0; i < records.length; i++) {
    const d = records[i].date
    if (!dateIndex.has(d)) dateIndex.set(d, i)
  }
  const REL_HOURS = Array.from({ length: 97 }, (_, i) => i - 24)
  const events = []
  for (const date of stormDates) {
    const startIdx = dateIndex.get(date)
    if (startIdx == null) continue
    const centerIdx = startIdx + 48
    const series = REL_HOURS.map((h) => {
      const idx = centerIdx + h * 4
      if (idx < 0 || idx >= records.length) return null
      return records[idx].water_level_ft ?? null
    })
    if (series.filter((v) => v != null).length >= REL_HOURS.length * 0.6) {
      events.push({ date, series })
    }
  }
  const meanSeries = REL_HOURS.map((_, i) => {
    const vals = events.map((e) => e.series[i]).filter((v) => v != null)
    return vals.length ? +avg(vals).toFixed(3) : null
  })
  return {
    relLabels: REL_HOURS.map((h) => `${h >= 0 ? "+" : ""}${h}h`),
    events,
    meanSeries,
  }
}

// Freshwater fraction: 1 = fully fresh (low conductance), 0 = saline (high conductance)
// Uses p5/p95 of daily conductance top as observed end-members: no calibration needed
function buildFreshwaterFraction(dailyDates, dailyConductTop) {
  const sorted = dailyConductTop.filter((v) => v != null).sort((a, b) => a - b)
  const cFresh = sorted[Math.floor(sorted.length * 0.05)]
  const cSaline = sorted[Math.floor(sorted.length * 0.95)]
  const span = cSaline - cFresh
  return {
    dates: dailyDates,
    fraction: dailyConductTop.map((c) =>
      c != null && span > 0 ? +(1 - (c - cFresh) / span).toFixed(3) : null
    ),
    cFresh: Math.round(cFresh),
    cSaline: Math.round(cSaline),
  }
}

// Monthly means across key sensor variables (uses raw 15-min records)
function buildMonthComparison(records) {
  const months = {
    "07": { name: "July", temps: [], conducts: [], salinities: [], levels: [] },
    "08": { name: "August", temps: [], conducts: [], salinities: [], levels: [] },
    "09": { name: "September", temps: [], conducts: [], salinities: [], levels: [] },
  }
  for (const r of records) {
    const mm = r.date.slice(5, 7)
    const m = months[mm]
    if (!m) continue
    if (r.temp_top_c != null && r.temp_top_c >= 15) m.temps.push(r.temp_top_c)
    if (r.conductance_top_us_cm != null) m.conducts.push(r.conductance_top_us_cm)
    if (r.salinity_bottom_ppt != null) m.salinities.push(r.salinity_bottom_ppt)
    if (r.water_level_ft != null) m.levels.push(r.water_level_ft)
  }
  return ["07", "08", "09"].map((mm) => {
    const m = months[mm]
    return {
      month: m.name,
      avgTemp: m.temps.length ? +avg(m.temps).toFixed(2) : null,
      avgConduct: m.conducts.length ? +avg(m.conducts).toFixed(1) : null,
      avgSalinity: m.salinities.length ? +avg(m.salinities).toFixed(4) : null,
      avgLevel: m.levels.length ? +avg(m.levels).toFixed(3) : null,
    }
  })
}

const zoomOptions = {
  pan: { enabled: true, mode: "x" },
  zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: "x" },
}

const lineOptions = (title) => ({
  responsive: true,
  animation: false,
  plugins: {
    legend: { position: "top" },
    title: { display: true, text: title },
    zoom: zoomOptions,
  },
  scales: {
    x: { ticks: { maxTicksLimit: 10, maxRotation: 0, autoSkip: true } },
  },
})

export default function ChartJSPage() {
  const { records, loading, error } = useData()
  const tempRef = useRef(null)
  const conductBarRef = useRef(null)
  const rainLevelRef = useRef(null)
  const stratRef = useRef(null)
  const salinityRef = useRef(null)
  const stormRef = useRef(null)
  const flowRef = useRef(null)
  const freshwaterRef = useRef(null)
  const bubbleRef = useRef(null)
  const stratScatterRef = useRef(null)

  if (loading) return <p className="status">Loading all 3 months of data...</p>
  if (error) return <p className="status error">Error: {error}</p>

  const labels = records.map((r) =>
    r.datetime.toDate().toISOString().slice(0, 16).replace("T", " ")
  )

  // 1. AREA LINE - temperature filled between top and bottom
  // Filter sensor errors: Miami-Dade summer canal water cannot plausibly be below 15 C
  const TEMP_MIN_PLAUSIBLE = 15
  let tempFilteredCount = 0
  const cleanTemp = (v) => {
    if (v == null || v < TEMP_MIN_PLAUSIBLE) { if (v != null) tempFilteredCount++; return null }
    return v
  }
  const tempTopClean = records.map((r) => cleanTemp(r.temp_top_c))
  const tempBottomClean = records.map((r) => cleanTemp(r.temp_bottom_c))
  const allTempVals = [...tempTopClean, ...tempBottomClean].filter((v) => v != null)
  const tempYMin = Math.floor(Math.min(...allTempVals))
  const tempYMax = Math.ceil(Math.max(...allTempVals))

  const tempData = {
    labels,
    datasets: [
      {
        label: "Water Temp Top (C)",
        data: tempTopClean,
        borderColor: "#f97316",
        backgroundColor: "rgba(249, 115, 22, 0.15)",
        fill: "+1",
        pointRadius: 0,
        tension: 0.2,
        spanGaps: false,
      },
      {
        label: "Water Temp Bottom (C)",
        data: tempBottomClean,
        borderColor: "#3b82f6",
        backgroundColor: "transparent",
        fill: false,
        pointRadius: 0,
        tension: 0.2,
        spanGaps: false,
      },
    ],
  }

  const tempOptions = {
    responsive: true,
    animation: false,
    plugins: {
      legend: { position: "top" },
      title: {
        display: true,
        text: tempFilteredCount > 0
          ? [
              "Water Temperature - Top vs Bottom (Area Fill)",
              `${tempFilteredCount} reading(s) below ${TEMP_MIN_PLAUSIBLE} C removed as implausible sensor errors`,
            ]
          : "Water Temperature - Top vs Bottom (Area Fill)",
      },
      zoom: zoomOptions,
    },
    scales: {
      x: { ticks: { maxTicksLimit: 10, maxRotation: 0, autoSkip: true } },
      y: { min: tempYMin - 1, max: tempYMax + 1, title: { display: true, text: "Temperature (C)" } },
    },
  }

  // 2. SCATTER - water level vs conductance (rainy vs dry days)
  const rainyDates = new Set()
  for (const r of records) {
    if (r.rainfall_in > 0) rainyDates.add(r.date)
  }
  const sampled = records.filter((_, i) => i % 4 === 0)
  const scatterData = {
    datasets: [
      {
        label: "Rainy day readings",
        data: sampled
          .filter((r) => r.water_level_ft != null && r.conductance_top_us_cm != null && rainyDates.has(r.date))
          .map((r) => ({ x: r.water_level_ft, y: r.conductance_top_us_cm })),
        backgroundColor: "rgba(96, 165, 250, 0.5)",
        pointRadius: 3,
      },
      {
        label: "Dry day readings",
        data: sampled
          .filter((r) => r.water_level_ft != null && r.conductance_top_us_cm != null && !rainyDates.has(r.date))
          .map((r) => ({ x: r.water_level_ft, y: r.conductance_top_us_cm })),
        backgroundColor: "rgba(251, 146, 60, 0.5)",
        pointRadius: 3,
      },
    ],
  }

  const scatterOptions = {
    responsive: true,
    animation: false,
    plugins: {
      legend: { position: "top" },
      title: {
        display: true,
        text: "Water Level vs Conductance - Rainy vs Dry Days (freshwater dilution effect)",
      },
    },
    scales: {
      x: { title: { display: true, text: "Water Level (ft NGVD29)" } },
      y: { title: { display: true, text: "Conductance Top (uS/cm)" } },
    },
  }

  // 3. GROUPED BAR - daily mean conductance
  const daily = buildDailyAggregates(records)
  const conductBarData = {
    labels: daily.dates,
    datasets: [
      {
        label: "Daily Mean Conductance Top (uS/cm)",
        data: daily.meanConductTop,
        backgroundColor: "#f59e0b",
      },
      {
        label: "Daily Mean Conductance Bottom (uS/cm)",
        data: daily.meanConductBottom,
        backgroundColor: "#ec4899",
      },
    ],
  }

  const allConductVals = [...daily.meanConductTop, ...daily.meanConductBottom]
    .filter((v) => v != null)
    .sort((a, b) => a - b)
  const p95idx = Math.floor(allConductVals.length * 0.95)
  const conductP95 = allConductVals[p95idx] ?? allConductVals[allConductVals.length - 1]
  const conductYMax = Math.ceil(conductP95 / 100) * 100
  const conductMax = Math.max(...allConductVals)
  const conductClipped = conductMax > conductYMax

  const conductBarOptions = {
    responsive: true,
    animation: false,
    plugins: {
      legend: { position: "top" },
      title: {
        display: true,
        text: conductClipped
          ? [
              "Daily Mean Specific Conductance - Top vs Bottom",
              `Y-axis capped at ${conductYMax} uS/cm (95th pct): outlier peak: ${conductMax.toLocaleString()} uS/cm`,
            ]
          : "Daily Mean Specific Conductance - Top vs Bottom",
      },
      zoom: zoomOptions,
    },
    scales: {
      x: { ticks: { maxTicksLimit: 12, maxRotation: 45, autoSkip: true } },
      y: {
        max: conductYMax,
        title: { display: true, text: "Conductance (uS/cm)" },
      },
    },
  }

  // 4. MIXED BAR + LINE - rainfall lag effect
  const rainLevelData = {
    labels: daily.dates,
    datasets: [
      {
        type: "bar",
        label: "Daily Rainfall (in)",
        data: daily.rainfall,
        backgroundColor: "#60a5faaa",
        yAxisID: "yRain",
        order: 2,
      },
      {
        type: "line",
        label: "Mean Water Level (ft)",
        data: daily.meanLevel,
        borderColor: "#34d399",
        backgroundColor: "transparent",
        pointRadius: 2,
        tension: 0.3,
        yAxisID: "yLevel",
        order: 1,
      },
    ],
  }

  const rainLevelOptions = {
    responsive: true,
    animation: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { position: "top" },
      title: {
        display: true,
        text: "Daily Rainfall vs Mean Canal Water Level (12-36 hr lag after rain events)",
      },
      zoom: zoomOptions,
    },
    scales: {
      x: { ticks: { maxTicksLimit: 15, maxRotation: 45, autoSkip: true } },
      yRain: {
        type: "linear",
        position: "left",
        title: { display: true, text: "Rainfall (in)" },
        grid: { drawOnChartArea: false },
      },
      yLevel: {
        type: "linear",
        position: "right",
        title: { display: true, text: "Water Level (ft NGVD29)" },
      },
    },
  }

  // 5. RADAR - diurnal temperature cycle
  const diurnal = buildDiurnal(records)
  const radarData = {
    labels: diurnal.hours,
    datasets: [
      {
        label: "Avg Temp Top (C)",
        data: diurnal.temp,
        borderColor: "#f97316",
        backgroundColor: "rgba(249, 115, 22, 0.2)",
        pointRadius: 2,
      },
    ],
  }

  const radarOptions = {
    responsive: true,
    animation: false,
    plugins: {
      legend: { position: "top" },
      title: {
        display: true,
        text: "Diurnal Temperature Cycle - 3-Month Hourly Average (Radar)",
      },
    },
    scales: {
      r: {
        min: 28,
        ticks: { stepSize: 0.5 },
        pointLabels: { font: { size: 11 } },
      },
    },
  }

  // 6. POLAR AREA - temperature std dev by hour
  const polarData = {
    labels: diurnal.hours,
    datasets: [
      {
        label: "Temp Std Dev (C)",
        data: diurnal.tempStdDev,
        backgroundColor: diurnal.hours.map(
          (_, i) => `hsla(${(i / 24) * 270}, 70%, 60%, 0.75)`
        ),
        borderWidth: 1,
      },
    ],
  }

  const polarOptions = {
    responsive: true,
    animation: false,
    plugins: {
      legend: { display: false },
      title: {
        display: true,
        text: "Temperature Variability by Hour - Std Dev across 92 days (Polar Area)",
      },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.label}: ${ctx.raw} C std dev`,
        },
      },
    },
  }

  // 7. STRATIFICATION INDEX - dual y-axis line chart
  const strat = buildStratification(records)
  const stratData = {
    labels: strat.labels,
    datasets: [
      {
        label: "Thermal Stratification: Top - Bottom (C)",
        data: strat.tempDiff,
        borderColor: "#f97316",
        backgroundColor: "transparent",
        pointRadius: 0,
        borderWidth: 1,
        tension: 0.2,
        yAxisID: "yTemp",
      },
      {
        label: "Halocline Index: Bottom - Top conductance (uS/cm)",
        data: strat.conductDiff,
        borderColor: "#7c3aed",
        backgroundColor: "transparent",
        pointRadius: 0,
        borderWidth: 1,
        tension: 0.2,
        yAxisID: "yConduct",
      },
    ],
  }

  const stratOptions = {
    responsive: true,
    animation: false,
    plugins: {
      legend: { position: "top" },
      title: {
        display: true,
        text: [
          "Water Column Stratification Index",
          "Both collapse toward zero during storm mixing events",
        ],
      },
      zoom: zoomOptions,
    },
    scales: {
      x: { ticks: { maxTicksLimit: 10, maxRotation: 0, autoSkip: true } },
      yTemp: {
        type: "linear",
        position: "left",
        title: { display: true, text: "Temp Diff (C)" },
      },
      yConduct: {
        type: "linear",
        position: "right",
        title: { display: true, text: "Conductance Diff (uS/cm)" },
        grid: { drawOnChartArea: false },
      },
    },
  }

  // 8. SALINITY INTRUSION TIMELINE
  const salinityData = {
    labels: strat.labels,
    datasets: [
      {
        label: "Salinity Bottom (ppt)",
        data: strat.salinityBottom,
        borderColor: "#0ea5e9",
        backgroundColor: "rgba(14, 165, 233, 0.12)",
        fill: true,
        pointRadius: 0,
        borderWidth: 1.5,
        tension: 0.2,
      },
      {
        label: "Freshwater threshold (0.5 ppt)",
        data: strat.labels.map(() => 0.5),
        borderColor: "#22c55e",
        backgroundColor: "transparent",
        borderDash: [6, 3],
        borderWidth: 1.5,
        pointRadius: 0,
      },
      {
        label: "Brackish/saline boundary (2 ppt)",
        data: strat.labels.map(() => 2),
        borderColor: "#ef4444",
        backgroundColor: "transparent",
        borderDash: [6, 3],
        borderWidth: 1.5,
        pointRadius: 0,
      },
    ],
  }

  const salinityOptions = {
    responsive: true,
    animation: false,
    plugins: {
      legend: { position: "top" },
      title: {
        display: true,
        text: "Saltwater Intrusion :  Bottom Salinity with Ecological Thresholds",
      },
      zoom: zoomOptions,
    },
    scales: {
      x: { ticks: { maxTicksLimit: 10, maxRotation: 0, autoSkip: true } },
      y: { title: { display: true, text: "Salinity (ppt)" } },
    },
  }

  // 9. RAINFALL MEMORY - mean water level at 0-7 day lags from rain events
  const rainMem = buildRainfallMemory(daily.rainfall, daily.meanLevel)
  const rainMemData = {
    labels: rainMem.lagLabels,
    datasets: [
      {
        type: "bar",
        label: "Mean Water Level (ft NGVD29)",
        data: rainMem.lagMeans,
        backgroundColor: rainMem.lagLabels.map((_, i) =>
          `rgba(59, 130, 246, ${+(1 - i * 0.1).toFixed(2)})`
        ),
        borderWidth: 0,
        order: 2,
      },
      {
        type: "line",
        label: `Dry day baseline (${rainMem.dryBase} ft)`,
        data: rainMem.lagLabels.map(() => rainMem.dryBase),
        borderColor: "#f59e0b",
        backgroundColor: "transparent",
        borderDash: [6, 3],
        borderWidth: 2,
        pointRadius: 0,
        order: 1,
      },
    ],
  }

  const rainMemOptions = {
    responsive: true,
    animation: false,
    plugins: {
      legend: { position: "top" },
      title: {
        display: true,
        text: [
          "Canal Water Level Memory After Rain Events (>= 0.5 in)",
          "Gold dashed line = average level on days with no rain in the prior 8 days",
        ],
      },
    },
    scales: {
      x: { title: { display: true, text: "Days since rain event" } },
      y: { title: { display: true, text: "Mean Water Level (ft NGVD29)" } },
    },
  }

  // 11. FLOW ANOMALY - simplified flow regime proxy via 5-day rolling mean baseline
  const flowAnom = buildFlowAnomaly(daily.dates, daily.meanLevel, daily.rainfall)
  const flowData = {
    labels: flowAnom.dates,
    datasets: [
      {
        label: "Net Drainage (above 5-day avg)",
        data: flowAnom.drainage,
        backgroundColor: "#16a34a",
        stack: "residual",
      },
      {
        label: "Tidal Backpressure / Deficit (below avg)",
        data: flowAnom.backpressure,
        backgroundColor: "#f87171",
        stack: "residual",
      },
      {
        label: "Rainfall scaled (reference)",
        data: flowAnom.rainfallScaled,
        backgroundColor: "rgba(147, 197, 253, 0.7)",
        stack: "rain",
      },
    ],
  }

  const flowOptions = {
    responsive: true,
    animation: false,
    plugins: {
      legend: { position: "top" },
      title: {
        display: true,
        text: [
          "Daily Flow Regime Proxy: Water Level Anomaly vs 5-Day Rolling Mean",
          "Green = freshwater drainage dominant | Red = tidal backpressure / drainage deficit",
          "Blue bars below zero = daily rainfall (scaled for reference)",
        ],
      },
      zoom: zoomOptions,
    },
    scales: {
      x: { ticks: { maxTicksLimit: 12, maxRotation: 45, autoSkip: true } },
      y: { title: { display: true, text: "Level Anomaly (ft)" } },
    },
  }

  // 10. STORM EVENT COMPOSITE - spaghetti plot
  const stormDates = daily.dates.filter((d, i) => daily.rainfall[i] >= 0.5)
  const stormComp = buildStormComposite(records, stormDates)
  const stormData = {
    labels: stormComp.relLabels,
    datasets: [
      ...stormComp.events.map((evt, i) => ({
        label: evt.date,
        data: evt.series,
        borderColor: `hsla(${(i / Math.max(stormComp.events.length, 1)) * 200 + 200}, 60%, 65%, 0.3)`,
        backgroundColor: "transparent",
        pointRadius: 0,
        borderWidth: 1,
        tension: 0.2,
      })),
      {
        label: "Mean response",
        data: stormComp.meanSeries,
        borderColor: "#f59e0b",
        backgroundColor: "transparent",
        pointRadius: 0,
        borderWidth: 2.5,
        tension: 0.2,
      },
    ],
  }

  const stormOptions = {
    responsive: true,
    animation: false,
    plugins: {
      legend: {
        position: "top",
        labels: { filter: (item) => item.text === "Mean response" },
      },
      title: {
        display: true,
        text: [
          "Storm Event Composite :  Canal Water Level Response",
          "Each line = one rain day >= 0.5 in, centered at noon. Gold = mean of all events.",
        ],
      },
      zoom: zoomOptions,
    },
    scales: {
      x: { ticks: { maxTicksLimit: 12, maxRotation: 0, autoSkip: true } },
      y: { title: { display: true, text: "Water Level (ft NGVD29)" } },
    },
  }

  // 12. BUBBLE - water level (x), conductance (y), temperature (size), rainy vs dry
  const bubbleSampled = records.filter((_, i) => i % 12 === 0)
  const toRadius = (temp) => Math.max(3, Math.min(14, (temp - 28) * 1.5 + 3))
  const bubbleChartData = {
    datasets: [
      {
        label: "Rainy day readings",
        data: bubbleSampled
          .filter(
            (r) =>
              r.water_level_ft != null &&
              r.conductance_top_us_cm != null &&
              r.temp_top_c != null &&
              r.temp_top_c >= 15 &&
              rainyDates.has(r.date)
          )
          .map((r) => ({
            x: r.water_level_ft,
            y: Math.min(r.conductance_top_us_cm, conductYMax),
            r: toRadius(r.temp_top_c),
          })),
        backgroundColor: "rgba(96, 165, 250, 0.45)",
      },
      {
        label: "Dry day readings",
        data: bubbleSampled
          .filter(
            (r) =>
              r.water_level_ft != null &&
              r.conductance_top_us_cm != null &&
              r.temp_top_c != null &&
              r.temp_top_c >= 15 &&
              !rainyDates.has(r.date)
          )
          .map((r) => ({
            x: r.water_level_ft,
            y: Math.min(r.conductance_top_us_cm, conductYMax),
            r: toRadius(r.temp_top_c),
          })),
        backgroundColor: "rgba(251, 146, 60, 0.45)",
      },
    ],
  }
  const bubbleOptions = {
    responsive: true,
    animation: false,
    plugins: {
      legend: { position: "top" },
      title: {
        display: true,
        text: [
          "Bubble Chart: Water Level vs Conductance, sized by Water Temperature",
          "Larger bubble = warmer water. Y-axis capped at p95 to suppress saltwater outlier.",
        ],
      },
      zoom: {
        pan: { enabled: true, mode: "xy" },
        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: "xy" },
      },
    },
    scales: {
      x: { title: { display: true, text: "Water Level (ft NGVD29)" } },
      y: { max: conductYMax, title: { display: true, text: "Conductance Top (uS/cm)" } },
    },
  }

  // 13. DOUGHNUT - flow regime day breakdown from chart 11 residuals
  let drainDays = 0, pressDays = 0, neutralDays = 0
  const REGIME_THRESH = 0.01
  for (let i = 0; i < flowAnom.drainage.length; i++) {
    if (flowAnom.drainage[i] > REGIME_THRESH) drainDays++
    else if (flowAnom.backpressure[i] < -REGIME_THRESH) pressDays++
    else neutralDays++
  }
  const totalRegimeDays = drainDays + pressDays + neutralDays
  const pct = (n) => Math.round((n / totalRegimeDays) * 100)
  const doughnutData = {
    labels: [
      `Net Drainage (${drainDays}d, ${pct(drainDays)}%)`,
      `Tidal Backpressure (${pressDays}d, ${pct(pressDays)}%)`,
      `Near-Neutral (${neutralDays}d, ${pct(neutralDays)}%)`,
    ],
    datasets: [
      {
        data: [drainDays, pressDays, neutralDays],
        backgroundColor: ["#16a34a", "#f87171", "#94a3b8"],
        borderWidth: 2,
      },
    ],
  }
  const doughnutOptions = {
    responsive: true,
    animation: false,
    plugins: {
      legend: { position: "right" },
      title: {
        display: true,
        text: [
          "Wet Season Flow Regime Breakdown: Jul-Sep 2025",
          "Based on daily water level anomaly vs 5-day rolling mean baseline",
        ],
      },
    },
  }

  // 14. FRESHWATER FRACTION - derived normalized index line
  const freshFrac = buildFreshwaterFraction(daily.dates, daily.meanConductTop)
  const freshwaterData = {
    labels: freshFrac.dates,
    datasets: [
      {
        label: "Freshwater Fraction (0=saline, 1=fresh)",
        data: freshFrac.fraction,
        borderColor: "#0ea5e9",
        backgroundColor: "rgba(14, 165, 233, 0.18)",
        fill: true,
        pointRadius: 0,
        borderWidth: 1.5,
        tension: 0.3,
      },
    ],
  }
  const freshwaterOptions = {
    responsive: true,
    animation: false,
    plugins: {
      legend: { position: "top" },
      title: {
        display: true,
        text: [
          "Freshwater Fraction: Conductance-Derived Daily Index (0=saline, 1=fresh)",
          `End-members: ${freshFrac.cFresh} uS/cm (freshest 5%) to ${freshFrac.cSaline} uS/cm (saltiest 5%)`,
        ],
      },
      zoom: zoomOptions,
    },
    scales: {
      x: { ticks: { maxTicksLimit: 10, maxRotation: 0, autoSkip: true } },
      y: { min: 0, max: 1, title: { display: true, text: "Freshwater Fraction" } },
    },
  }

  // 15. CONDUCTANCE STRATIFICATION SCATTER - top vs bottom with y=x diagonal
  const stratScat = records.filter((_, i) => i % 8 === 0)
  const condCap = conductYMax
  const stratAboveDiag = stratScat.filter(
    (r) =>
      r.conductance_top_us_cm != null &&
      r.conductance_bottom_us_cm != null &&
      r.conductance_bottom_us_cm > r.conductance_top_us_cm &&
      r.conductance_top_us_cm <= condCap &&
      r.conductance_bottom_us_cm <= condCap
  )
  const stratBelowDiag = stratScat.filter(
    (r) =>
      r.conductance_top_us_cm != null &&
      r.conductance_bottom_us_cm != null &&
      r.conductance_bottom_us_cm <= r.conductance_top_us_cm &&
      r.conductance_top_us_cm <= condCap &&
      r.conductance_bottom_us_cm <= condCap
  )
  const stratScatterData = {
    datasets: [
      {
        label: "Bottom saltier than top (tidal intrusion)",
        data: stratAboveDiag.map((r) => ({ x: r.conductance_top_us_cm, y: r.conductance_bottom_us_cm })),
        backgroundColor: "rgba(239, 68, 68, 0.4)",
        pointRadius: 2.5,
      },
      {
        label: "Top saltier or equal (freshwater dominant)",
        data: stratBelowDiag.map((r) => ({ x: r.conductance_top_us_cm, y: r.conductance_bottom_us_cm })),
        backgroundColor: "rgba(34, 197, 94, 0.4)",
        pointRadius: 2.5,
      },
      {
        label: "y = x (no stratification)",
        showLine: true,
        data: [{ x: 0, y: 0 }, { x: condCap, y: condCap }],
        borderColor: "#f59e0b",
        borderDash: [6, 3],
        borderWidth: 2,
        pointRadius: 0,
        backgroundColor: "transparent",
      },
    ],
  }
  const stratScatterOptions = {
    responsive: true,
    animation: false,
    plugins: {
      legend: { position: "top" },
      title: {
        display: true,
        text: [
          "Conductance Stratification Scatter: Surface vs Bottom (uS/cm)",
          "Red above gold diagonal = saltier at bottom = tidal intrusion from Biscayne Bay",
        ],
      },
    },
    scales: {
      x: { min: 0, max: condCap, title: { display: true, text: "Conductance Top (uS/cm)" } },
      y: { min: 0, max: condCap, title: { display: true, text: "Conductance Bottom (uS/cm)" } },
    },
  }

  // 16. MONTH COMPARISON - key variables normalized to season average
  const monthComp = buildMonthComparison(records)
  const compKeys = ["avgTemp", "avgConduct", "avgSalinity", "avgLevel"]
  const compLabels = ["Temp Top (C)", "Conductance Top", "Salinity Bottom (ppt)", "Water Level (ft)"]
  const monthNorm = compKeys.map((key) => {
    const vals = monthComp.map((m) => m[key]).filter((v) => v != null)
    const overallMean = vals.length ? avg(vals) : 1
    return monthComp.map((m) => (m[key] != null ? +(m[key] / overallMean * 100).toFixed(1) : null))
  })
  const allNormVals = monthNorm.flat().filter((v) => v != null)
  const normYMin = Math.max(50, Math.floor(Math.min(...allNormVals) / 5) * 5 - 5)
  const normYMax = Math.ceil(Math.max(...allNormVals) / 5) * 5 + 5
  const monthCompData = {
    labels: compLabels,
    datasets: [
      {
        label: "July",
        data: compKeys.map((_, vi) => monthNorm[vi][0]),
        backgroundColor: "#f97316",
      },
      {
        label: "August",
        data: compKeys.map((_, vi) => monthNorm[vi][1]),
        backgroundColor: "#8b5cf6",
      },
      {
        label: "September",
        data: compKeys.map((_, vi) => monthNorm[vi][2]),
        backgroundColor: "#0ea5e9",
      },
    ],
  }
  const monthCompOptions = {
    responsive: true,
    animation: false,
    plugins: {
      legend: { position: "top" },
      title: {
        display: true,
        text: [
          "Month-by-Month Comparison: Normalized to Season Average (100 = seasonal mean)",
          "Above 100 = that month exceeded the 3-month average for that variable",
        ],
      },
    },
    scales: {
      x: { title: { display: true, text: "Variable" } },
      y: {
        min: normYMin,
        max: normYMax,
        title: { display: true, text: "% of season average" },
      },
    },
  }

  function resetAll() {
    ;[
      tempRef, conductBarRef, rainLevelRef, stratRef, salinityRef,
      stormRef, flowRef, freshwaterRef, bubbleRef, stratScatterRef,
    ].forEach((r) => r.current?.resetZoom())
  }

  return (
    <div className="chart-page">
      <h1>Chart.js</h1>
      <p>
        Full 3 months &middot; 15-min intervals &middot; USGS site 2286328 &middot;{" "}
        <strong>Scroll to zoom &middot; drag to pan (time-series)</strong>
      </p>
      <p className="section-desc">
        Chart.js renders every chart onto an HTML{" "}
        <strong style={{ color: "#f8fafc" }}>{"<canvas>"}</strong> element using the 2-D Canvas API.
        Because there is no SVG DOM, individual data points cannot be targeted by CSS selectors or
        manipulated after render: instead, Chart.js exposes a declarative{" "}
        <code>data</code> + <code>options</code> configuration object and redraws the entire
        canvas when data changes. This makes it extremely fast for large datasets (8,832 records
        here) but limits per-element control. Zoom and pan are provided by{" "}
        <code>chartjs-plugin-zoom</code> (built on Hammer.js + d3-zoom), registered globally
        once. React components come from <code>react-chartjs-2</code>, which wraps each Chart.js
        instance in a <code>useRef</code>-backed canvas element and exposes{" "}
        <code>ref.current.resetZoom()</code> for the reset button below.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", margin: "0.75rem 0 0.5rem", fontSize: "0.82rem" }}>
        <div>
          <div style={{ color: "#34d399", fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Strengths</div>
          <ul style={{ margin: 0, paddingLeft: "1.15rem", color: "#94a3b8", lineHeight: 1.5 }}>
            <li>Canvas rendering draws all 8,832 points in a single frame: no SVG DOM overhead</li>
            <li>A single <code>data</code> + <code>options</code> config works identically across all 8 built-in chart types</li>
            <li>Plugin system adds zoom/pan, annotation pins, and trendlines with one <code>ChartJS.register()</code> call</li>
            <li><code>ref.current.resetZoom()</code> gives programmatic access to the chart instance from React</li>
          </ul>
        </div>
        <div>
          <div style={{ color: "#f87171", fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Limitations</div>
          <ul style={{ margin: 0, paddingLeft: "1.15rem", color: "#94a3b8", lineHeight: 1.5 }}>
            <li>No per-element CSS: all point-level styling routes through the options object or canvas draw calls</li>
            <li>Exotic layouts (chord diagrams, force simulations, treemaps) require full custom Canvas2D math</li>
            <li>No SVG output: charts cannot be vector-exported or made accessible via the DOM</li>
            <li>3-D and geographic charts are out of scope; Plotly or D3 are required for those types</li>
          </ul>
        </div>
      </div>
      <button className="reset-btn" onClick={resetAll}>
        Reset All Zoom
      </button>

      <h2 className="section-heading">1. Area Chart - Water Temperature Range</h2>
      <p className="section-desc">
        The orange fill between the two temperature lines uses Chart.js's{" "}
        <code>fill: "+1"</code> option: a relative fill target that tells the surface
        dataset to fill downward to the dataset immediately below it in the array. This is
        the idiomatic Chart.js way to shade the gap between two lines; in Recharts you would
        use two stacked <code>Area</code> components; in D3 you would build a custom{" "}
        <code>d3.area()</code> generator with separate <code>y0</code> and <code>y1</code>
        accessors. Readings below 15 C are nulled as implausible sensor errors; the gap
        is left blank because <code>spanGaps: false</code> is set: Chart.js honours null
        values and does not interpolate across them. Scroll to zoom, drag to pan.
      </p>
      <section className="chart-section">
        <Line ref={tempRef} data={tempData} options={tempOptions} />
      </section>

      <h2 className="section-heading">2. Scatter - Freshwater Dilution Effect</h2>
      <p className="section-desc">
        Each point is one 15-minute reading (sampled every 4th record to keep the canvas
        responsive). Chart.js renders scatter plots via its built-in{" "}
        <code>ScatterController</code>; the <code>Scatter</code> component from
        react-chartjs-2 wraps it. Rainy and dry days are split into two separate datasets
        so they can receive independent colours and legend entries: the cleanest approach
        in Chart.js's dataset-centric model. The expected freshwater-dilution signal
        appears as a downward trend: when the canal is higher after rain (x-axis right),
        conductance falls (y-axis down) as freshwater displaces saltier baseline water.
      </p>
      <section className="chart-section">
        <Scatter data={scatterData} options={scatterOptions} />
      </section>

      <h2 className="section-heading">3. Grouped Bar - Daily Mean Conductance</h2>
      <p className="section-desc">
        Two datasets on a single <code>Bar</code> chart render as side-by-side grouped bars
        by default: no extra configuration needed. The y-axis is capped at the 95th
        percentile of all conductance readings via <code>scales.y.max</code>, suppressing a
        single extreme salt-intrusion outlier that would otherwise compress 90% of the data
        into the bottom quarter of the chart. A subtitle in the chart title string (an array)
        discloses the clipped maximum. Gaps where surface conductance is much lower than
        bottom conductance indicate days when freshwater rain sits on top of denser saline
        water: a vertical salinity gradient called a halocline. Scroll to zoom.
      </p>
      <section className="chart-section">
        <Bar ref={conductBarRef} data={conductBarData} options={conductBarOptions} />
      </section>

      <h2 className="section-heading">4. Mixed Bar + Line - Rainfall Lag Effect</h2>
      <p className="section-desc">
        Chart.js supports mixed chart types natively: set <code>type: "bar"</code> on the
        rainfall dataset and <code>type: "line"</code> on the water level dataset within the
        same <code>data.datasets</code> array. Each dataset is then routed to its own y-axis
        via <code>yAxisID</code>, and{" "}
        <code>interaction: {'{ mode: "index", intersect: false }'}</code> makes hovering
        anywhere on a given x-position show both series values in a single tooltip: a
        built-in Chart.js interaction mode that would require a custom tooltip render
        function in D3. Zoom into any individual storm event to see the 12-36 hour lag
        between rainfall peak and peak canal stage.
      </p>
      <section className="chart-section">
        <Chart ref={rainLevelRef} type="bar" data={rainLevelData} options={rainLevelOptions} />
      </section>

      <h2 className="section-heading">5. Radar - Diurnal Temperature Cycle</h2>
      <p className="section-desc">
        Chart.js's <code>Radar</code> component uses <code>RadialLinearScale</code> to draw
        24 equidistant spokes: one per hour. The <code>r.min</code> scale option zooms the
        radial axis so it starts at 28 C rather than zero, which would collapse all variation
        into a thin ring near the edge. The canvas polygon is shaded with a low-opacity fill
        and a solid border line. Compared to the D3 radial polar area chart (chart 9 on the
        D3 page), this encodes the same data with area shape rather than wedge length: a
        design choice that emphasises the gradient across the full cycle rather than
        individual hour magnitudes. The 9am gap from a USGS telemetry delay is filled by
        neighbour interpolation before charting.
      </p>
      <section className="chart-section radar-section">
        <Radar data={radarData} options={radarOptions} />
      </section>

      <h2 className="section-heading">6. Polar Area - Temperature Variability by Hour</h2>
      <p className="section-desc">
        <code>PolarArea</code> is a Chart.js-native chart type where each segment's{" "}
        <em>radius</em> (not arc sweep) encodes its value, so area differences are visually
        proportional to the data. Here the value is the standard deviation of temperature
        across all 92 days for that hour: a measure of day-to-day variability, not the mean.
        Segment colours are generated with <code>hsla()</code> interpolated across the hue
        range as a JavaScript array passed to <code>backgroundColor</code>; in Chart.js any
        per-element property can be supplied as an array aligned to the data array. The
        Recharts equivalent (<code>RadialBarChart</code>) encodes the same idea but uses bar
        length not area: a subtle perceptual difference in how magnitude is read.
      </p>
      <section className="chart-section polar-section">
        <PolarArea data={polarData} options={polarOptions} />
      </section>

      <h2 className="section-heading">7. Dual-Axis Line - Water Column Stratification Index</h2>
      <p className="section-desc">
        Two independent y-axes (<code>yAxisID: "yTemp"</code> left,{" "}
        <code>yAxisID: "yConduct"</code> right) let temperature difference (C) and conductance
        difference (uS/cm) coexist on the same time axis despite their different units and
        magnitudes. <code>grid: {'{ drawOnChartArea: false }'}</code> on the right axis
        suppresses a second overlapping grid layer. When both lines drop toward zero
        simultaneously it signals a mixing event: rain and wind have homogenised the water
        column, erasing both the thermal gradient (orange, surface warmer) and the halocline
        (purple, saltier at depth). Zoom in on a storm event to see this collapse and the
        recovery phase.
      </p>
      <section className="chart-section">
        <Line ref={stratRef} data={stratData} options={stratOptions} />
      </section>

      <h2 className="section-heading">8. Area Line - Saltwater Intrusion Timeline</h2>
      <p className="section-desc">
        The two horizontal threshold lines (0.5 ppt freshwater boundary, 2 ppt saline boundary)
        are added as separate constant-value datasets with <code>borderDash: [6, 3]</code> and
        <code>pointRadius: 0</code>: the standard Chart.js pattern for reference lines since
        there is no native annotation layer without an additional plugin. The salinity area fill
        uses <code>fill: true</code> (fills down to the x-axis baseline). Pulses above 0.5 ppt
        indicate tidal intrusion from Biscayne Bay pushing denser saline water upstream during
        low-flow or spring-tide windows; spikes above 2 ppt mean salt is penetrating well into
        the canal interior: a concern for the freshwater-dependent ecosystems of the Miami
        ridge and the drinking-water control structures upstream.
      </p>
      <section className="chart-section">
        <Line ref={salinityRef} data={salinityData} options={salinityOptions} />
      </section>

      <h2 className="section-heading">9. Bar + Line - Canal Water Level Memory After Rain</h2>
      <p className="section-desc">
        This chart aggregates the dataset to answer a single question: how long does the canal
        "remember" a rain event? Every day with rainfall {">"}= 0.5 in is a storm event;
        the x-axis is the lag in days (0 = rain day, 1 = next day, ..., 7 = a week later).
        Bar opacity decreases with lag using a <code>backgroundColor</code> array of
        interpolated <code>rgba()</code> strings: a per-bar colour array aligned to the
        data array, one of Chart.js's most flexible per-element properties. The gold baseline
        is again a constant-value line dataset. Using the <code>Chart</code> generic component
        from react-chartjs-2 (instead of <code>Bar</code>) is required when mixing bar and
        line dataset types in a single chart.
      </p>
      <section className="chart-section">
        <Chart type="bar" data={rainMemData} options={rainMemOptions} />
      </section>

      <h2 className="section-heading">10. Storm Event Composite - Spaghetti Plot</h2>
      <p className="section-desc">
        Each storm event becomes its own semi-transparent line dataset, all sharing the same
        relative time axis (-24h to +72h from the event). This "spaghetti plot" pattern is
        straightforward in Chart.js because <code>data.datasets</code> is a plain array: any
        number of datasets can be added programmatically. The legend is filtered to show only
        the mean-response line via{" "}
        <code>{'labels: { filter: item => item.text === "Mean response" }'}</code>, hiding the
        per-event entries that would flood the legend. The gold mean line sits on top because
        it is the last dataset in the array and Chart.js paints datasets in order. This composite
        view reveals whether all storms produce a similar water-level response or whether
        event size, season, or antecedent moisture drive wide divergence.
      </p>
      <section className="chart-section">
        <Line ref={stormRef} data={stormData} options={stormOptions} />
      </section>

      <h2 className="section-heading">11. Stacked Bar - Daily Flow Regime Proxy</h2>
      <p className="section-desc">
        Chart.js's <code>stack</code> dataset property groups datasets into named stacks that
        accumulate vertically. Here three datasets share two stacks: the green drainage bars
        and red backpressure bars share <code>stack: "residual"</code> so they extend in
        opposite directions from zero, while the scaled rainfall bars use{" "}
        <code>stack: "rain"</code> so they are independent and always appear below the x-axis.
        The residual value is each day's mean water level minus a 5-day centred rolling mean --
        a simplified non-tidal residual. Green = canal above its recent average (freshwater
        drainage pushing the stage up); red = below average (tidal backpressure holding water
        back or post-storm drainage deficit). Scroll to zoom.
      </p>
      <section className="chart-section">
        <Bar ref={flowRef} data={flowData} options={flowOptions} />
      </section>

      <h2 className="section-heading">12. Bubble - Water Level, Conductance and Temperature</h2>
      <p className="section-desc">
        Chart.js's <code>Bubble</code> chart is a first-class built-in type where the{" "}
        <code>r</code> property in each data point sets the pixel radius of the circle on
        the canvas: note this is radius, not area, so the scaling function{" "}
        <code>toRadius(temp)</code> maps the 28-36 C range to 3-14 px linearly. The
        rainy/dry split creates two datasets with separate colours and legend entries.
        Three variables (x = water level, y = conductance, size = temperature) fit into
        a single chart: rainy-day points cluster toward higher water and lower conductance
        (freshwater dilution), while dry-day readings stay at lower levels with higher
        conductance (tidal influence). A similar chart in D3 would require three separate
        scale calls and manual circle drawing; here it is 12 lines of dataset configuration.
        Scroll to zoom X and Y independently; drag to pan.
      </p>
      <section className="chart-section">
        <Bubble ref={bubbleRef} data={bubbleChartData} options={bubbleOptions} />
      </section>

      <h2 className="section-heading">13. Doughnut - Wet Season Flow Regime Breakdown</h2>
      <p className="section-desc">
        Chart.js's <code>Doughnut</code> uses the <code>ArcElement</code> to draw arc
        segments whose sweep angle is proportional to the value. Each of the 92 days is
        classified from the chart 11 residuals: drainage-dominant (above the 5-day rolling
        mean by more than 0.01 ft), tidal backpressure (below by the same threshold), or
        near-neutral. The inner cutout (the "hole" in the doughnut) is a Chart.js default
        that would require explicit SVG <code>innerRadius</code> math in D3. Compared to
        Plotly's Sankey (which shows the same flow classification as a flow diagram),
        this view collapses everything to a simple proportion: fast to read, less detail.
        A freshwater-dominated system should have more drainage days than backpressure days.
      </p>
      <section className="chart-section polar-section">
        <Doughnut data={doughnutData} options={doughnutOptions} />
      </section>

      <h2 className="section-heading">14. Area Line - Freshwater Fraction Index</h2>
      <p className="section-desc">
        This chart displays a derived variable rather than a raw sensor reading: the freshwater
        fraction is computed from daily mean surface conductance rescaled between the observed
        5th-percentile conductance (freshest days in the dataset) and 95th-percentile
        (saltiest days), producing a 0-1 index with no external calibration needed. A forced
        <code>min: 0, max: 1</code> y-axis scale prevents Chart.js from auto-ranging the axis
        and losing the absolute meaning of the endpoints. The filled area uses{" "}
        <code>fill: true</code>. This normalised index is more intuitive than the raw
        conductance values in chart 3 and makes the timing of freshwater pulses, tidal drawdown
        periods, and the seasonal shift toward saltier conditions in September immediately
        readable without domain knowledge of conductance units.
      </p>
      <section className="chart-section">
        <Line ref={freshwaterRef} data={freshwaterData} options={freshwaterOptions} />
      </section>

      <h2 className="section-heading">15. Scatter - Conductance Stratification Diagram</h2>
      <p className="section-desc">
        The gold y = x reference diagonal is added as a third dataset with{" "}
        <code>showLine: true</code> and <code>pointRadius: 0</code>: the Chart.js idiom for
        drawing a non-data reference line on a scatter chart without a plugin. Points above the
        diagonal (red) have higher conductance at the bottom sensor than at the surface,
        indicating denser saline water underflowing the fresh surface layer: the classic
        signature of tidal intrusion from Biscayne Bay. Points on or below (green) indicate a
        well-mixed or freshwater-dominant column. Both axes are capped at the same p95 value
        so the diagonal remains at 45 degrees. This diagram is a compressed version of the
        chart 7 stratification time series: instead of showing how the halocline evolves over
        time, it shows how frequently and at what absolute conductance levels intrusion occurs.
      </p>
      <section className="chart-section">
        <Scatter ref={stratScatterRef} data={stratScatterData} options={stratScatterOptions} />
      </section>

      <h2 className="section-heading">16. Grouped Bar - Month-by-Month Seasonal Comparison</h2>
      <p className="section-desc">
        Four variables with different units (C, uS/cm, ppt, ft) are made comparable by
        normalising each to its own 3-month mean (100 = seasonal average). Chart.js's grouped
        bar layout places all three month bars side by side for each variable automatically
        when multiple datasets are present. The y-axis is tightened to{" "}
        <code>min: normYMin, max: normYMax</code> computed from the actual spread so the
        chart uses its full height rather than starting at zero. The pattern that consistently
        emerges: salinity and conductance are above their seasonal averages in September as
        wet-season rainfall tapers off and Biscayne Bay tidal influence reasserts, while
        water levels often peak in August after the heaviest mid-season storms and then fall
        again. Temperature varies least across months because solar forcing is nearly constant
        through the Miami summer.
      </p>
      <section className="chart-section">
        <Bar data={monthCompData} options={monthCompOptions} />
      </section>
    </div>
  )
}
