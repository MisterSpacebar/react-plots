/**
 * EChartsPage.jsx
 * ----------------
 * Ten charts built with Apache ECharts via echarts-for-react.
 *
 * ECharts advantages highlighted here:
 *   - dataZoom (inside + slider) with sampling:'lttb' for raw 8,832-point canvas
 *   - calendar coordinate system: built-in GitHub-style heatmap grid
 *   - parallel coordinate system: multi-axis projection, brushable
 *   - sunburst: zoomable hierarchical ring chart
 *   - themeRiver: temporal stream composition (unique to ECharts here)
 *   - polar bar: 24-spoke clock-face bar chart
 *   - boxplot: first-class 5-number summary + outlier scatter
 *   - visualMap: declarative continuous colour mapping on any data dimension
 *   - markArea / markLine: built-in annotation system inside series options
 *   - Cartesian heatmap: hour × week temperature grid with visualMap
 */

import { useMemo } from "react"
import ReactECharts from "echarts-for-react"
import { useData } from "../DataContext"

/* ── helpers ─────────────────────────────────────────────────────── */
function avg(arr) {
  if (!arr.length) return null
  return arr.reduce((s, v) => s + v, 0) / arr.length
}
function pct(arr, p) {
  if (!arr.length) return null
  const sorted = [...arr].sort((a, b) => a - b)
  return sorted[Math.floor((p / 100) * (sorted.length - 1))]
}
function quantile(sv, p) {
  const idx = (p / 100) * (sv.length - 1)
  const lo = Math.floor(idx), hi = Math.ceil(idx)
  return +(sv[lo] + (sv[hi] - sv[lo]) * (idx - lo)).toFixed(2)
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
      const m = dt.getMonth() + 1
      const monthName = m === 7 ? "July" : m === 8 ? "August" : "September"
      const vTT = rows.map(r => r.temp_top_c).filter(v => v != null && v >= 15)
      const vCT = rows.map(r => r.conductance_top_us_cm).filter(v => v != null)
      const vCB = rows.map(r => r.conductance_bottom_us_cm).filter(v => v != null)
      const vSB = rows.map(r => r.salinity_bottom_ppt).filter(v => v != null)
      const vLv = rows.map(r => r.water_level_ft).filter(v => v != null)
      return {
        date, dt, monthName,
        rain:        Math.max(0, ...rows.map(r => r.rainfall_in ?? 0)),
        meanLevel:   vLv.length ? +avg(vLv).toFixed(3)  : null,
        meanTempTop: vTT.length ? +avg(vTT).toFixed(2)  : null,
        meanCondTop: vCT.length ? +avg(vCT).toFixed(1)  : null,
        meanCondBot: vCB.length ? +avg(vCB).toFixed(1)  : null,
        meanSalBot:  vSB.length ? +avg(vSB).toFixed(3)  : null,
      }
    })
}

/* ── shared palette / layout ─────────────────────────────────────── */
const BG    = "#1e293b"
const MCOLS = { July: "#f97316", August: "#a855f7", September: "#06b6d4" }
const RCOLS = { Drainage: "#34d399", Neutral: "#94a3b8", Backpressure: "#f87171" }

const AX = {
  axisLine:      { lineStyle: { color: "#475569" } },
  axisLabel:     { color: "#94a3b8" },
  splitLine:     { lineStyle: { color: "#334155" } },
  axisTick:      { lineStyle: { color: "#475569" } },
  nameTextStyle: { color: "#94a3b8" },
}
const TT = {
  backgroundColor: "#0f172a",
  borderColor: "#334155",
  textStyle: { color: "#e2e8f0", fontSize: 11 },
}
const TOOLBOX = {
  right: 10,
  iconStyle: { borderColor: "#94a3b8" },
  feature: { saveAsImage: { backgroundColor: BG }, restore: {} },
}
const SLIDER_DZ = {
  type: "slider", height: 20, bottom: 4,
  borderColor: "#475569", backgroundColor: "#0f172a",
  fillerColor: "rgba(56,189,248,0.12)",
  handleStyle: { color: "#38bdf8" },
  textStyle: { color: "#94a3b8" },
  dataBackground: { areaStyle: { color: "#1e3a5f" }, lineStyle: { color: "#38bdf8" } },
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
  fontSize: "1.1rem", fontWeight: 700, color: "#f8fafc",
  margin: "2rem 0 0.25rem", borderBottom: "1px solid #334155", paddingBottom: 6,
}
const descStyle = {
  fontSize: "0.82rem", color: "#94a3b8", margin: "0 0 0.75rem", lineHeight: 1.6,
}
const boxStyle = {
  background: BG, borderRadius: 8, overflow: "hidden", marginBottom: "0.5rem",
}

const EC = { notMerge: true, lazyUpdate: true }

/* ═══════════════════════════════════════════════════════════════════
   Page
   ═══════════════════════════════════════════════════════════════════ */
export default function EChartsPage() {
  const { records, loading, error } = useData()

  /* ── All hooks before any early return ─────────────────────────── */
  const daily = useMemo(() => records.length ? buildDaily(records) : [], [records])

  const condP95 = useMemo(() => {
    const all = daily.flatMap(d => [d.meanCondTop, d.meanCondBot].filter(Boolean))
    return all.length ? +pct(all, 95).toFixed(0) : 1000
  }, [daily])

  /* Pre-classify daily flow regime (shared by charts 4 & 5) */
  const regimes = useMemo(() => {
    const levels = daily.map(d => d.meanLevel)
    return daily.map((d, i) => {
      const lv = d.meanLevel
      if (lv == null) return "Neutral"
      const slice = levels.slice(Math.max(0, i - 2), i + 3).filter(Boolean)
      const roll = slice.length ? avg(slice) : lv
      const diff = lv - roll
      return diff > 0.01 ? "Drainage" : diff < -0.01 ? "Backpressure" : "Neutral"
    })
  }, [daily])

  /* ── 1. Raw 15-min time series with dataZoom + LTTB sampling ────── */
  const opt1 = useMemo(() => {
    const data = records
      .filter(r => r.water_level_ft != null && r.datetime)
      .map(r => [r.datetime.toDate().getTime(), r.water_level_ft])
    return {
      backgroundColor: BG,
      animation: false,
      toolbox: TOOLBOX,
      tooltip: { trigger: "axis", ...TT, axisPointer: { lineStyle: { color: "#475569" } } },
      dataZoom: [
        { type: "inside", start: 0, end: 33, minValueSpan: 86400000 },
        { ...SLIDER_DZ, start: 0, end: 33 },
      ],
      grid: { top: 40, right: 20, bottom: 64, left: 58 },
      xAxis: { type: "time", ...AX },
      yAxis: { type: "value", name: "Water Level (ft)", ...AX },
      series: [{
        type: "line", data,
        large: true, largeThreshold: 2000, sampling: "lttb",
        showSymbol: false,
        lineStyle: { color: "#38bdf8", width: 1.2 },
        areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: "rgba(56,189,248,0.25)" }, { offset: 1, color: "rgba(56,189,248,0)" }] } },
      }],
    }
  }, [records])

  /* ── 2. Calendar heatmap – daily rainfall ───────────────────────── */
  const opt2 = useMemo(() => {
    const maxRain = Math.max(0.1, ...daily.map(d => d.rain))
    return {
      backgroundColor: BG,
      tooltip: { ...TT, formatter: p => `${p.data[0]}<br/>Rain: <b>${(+p.data[1]).toFixed(2)} in</b>` },
      visualMap: {
        min: 0, max: maxRain, calculable: true,
        orient: "horizontal", left: "center", bottom: 4,
        inRange: { color: ["#1e3a5f", "#38bdf8", "#f97316", "#ef4444"] },
        textStyle: { color: "#94a3b8" },
      },
      calendar: {
        range: ["2025-07-01", "2025-09-30"],
        top: 48, left: 42, right: 42,
        cellSize: ["auto", 20],
        itemStyle: { borderColor: "#0f172a", borderWidth: 2 },
        yearLabel: { show: false },
        monthLabel: { nameMap: "en", color: "#e2e8f0", fontSize: 11 },
        dayLabel: { firstDay: 0, color: "#94a3b8", fontSize: 10 },
      },
      series: [{
        type: "heatmap",
        coordinateSystem: "calendar",
        data: daily.map(d => [d.date, d.rain]),
      }],
    }
  }, [daily])

  /* ── 3. Parallel coordinates – daily aggregates by month ────────── */
  const opt3 = useMemo(() => {
    const axisDefs = [
      { dim: 0, name: "Rain (in)",      min: 0 },
      { dim: 1, name: "Level (ft)" },
      { dim: 2, name: "Temp (°C)",      min: 28, max: 36 },
      { dim: 3, name: "Cond (µS/cm)",   min: 0, max: condP95 },
      { dim: 4, name: "Salinity (ppt)", min: 0 },
    ]
    const mkSeries = m => ({
      type: "parallel", name: m,
      lineStyle: { width: 1, opacity: 0.45, color: MCOLS[m] },
      data: daily
        .filter(d => d.monthName === m && d.meanTempTop != null && d.meanCondTop != null && d.meanLevel != null)
        .map(d => [d.rain, d.meanLevel, d.meanTempTop, Math.min(d.meanCondTop, condP95), d.meanSalBot ?? 0]),
    })
    return {
      backgroundColor: BG,
      legend: { data: ["July", "August", "September"], top: 4, textStyle: { color: "#cbd5e1" } },
      tooltip: { ...TT },
      parallel: { left: "6%", right: "6%", top: 52, bottom: 36 },
      parallelAxis: axisDefs.map(s => ({
        ...s, ...AX,
        axisLabel: { ...AX.axisLabel, fontSize: 10 },
        nameTextStyle: { color: "#e2e8f0", fontSize: 11 },
      })),
      series: ["July", "August", "September"].map(mkSeries),
    }
  }, [daily, condP95])

  /* ── 4. Sunburst – flow regime by month ─────────────────────────── */
  const opt4 = useMemo(() => {
    const byMonth = {
      July:      { Drainage: 0, Neutral: 0, Backpressure: 0 },
      August:    { Drainage: 0, Neutral: 0, Backpressure: 0 },
      September: { Drainage: 0, Neutral: 0, Backpressure: 0 },
    }
    daily.forEach((d, i) => { byMonth[d.monthName][regimes[i]]++ })
    return {
      backgroundColor: BG,
      tooltip: { ...TT, trigger: "item", formatter: p => `${p.name}<br/>${p.value} days` },
      series: [{
        type: "sunburst",
        center: ["50%", "50%"],
        radius: ["15%", "92%"],
        sort: null,
        emphasis: { focus: "ancestor" },
        levels: [
          {},
          { r0: "15%", r: "40%", label: { rotate: 0, fontSize: 13 } },
          { r0: "40%", r: "70%", label: { rotate: "radial", fontSize: 11 } },
          { r0: "70%", r: "92%", label: { rotate: "tangential", fontSize: 9, minAngle: 10 } },
        ],
        data: [{
          name: "Wet\nSeason",
          itemStyle: { color: "#334155" },
          label: { color: "#e2e8f0", fontSize: 10 },
          children: ["July", "August", "September"].map(m => ({
            name: m,
            itemStyle: { color: MCOLS[m], opacity: 0.85 },
            label: { color: "#fff", fontSize: 11 },
            children: ["Drainage", "Neutral", "Backpressure"].map(r => ({
              name: r,
              value: byMonth[m][r],
              itemStyle: { color: RCOLS[r] },
              label: { color: "#fff", fontSize: 9 },
            })),
          })),
        }],
      }],
    }
  }, [daily, regimes])

  /* ── 5. ThemeRiver – 7-day rolling regime composition ──────────── */
  const opt5 = useMemo(() => {
    const WIN = 7
    const data = []
    for (let i = 0; i < daily.length; i++) {
      const lo = Math.max(0, i - Math.floor(WIN / 2))
      const hi = Math.min(daily.length, lo + WIN)
      const counts = { Drainage: 0, Neutral: 0, Backpressure: 0 }
      for (let j = lo; j < hi; j++) counts[regimes[j]]++
      for (const [name, cnt] of Object.entries(counts)) {
        data.push([daily[i].date, cnt, name])
      }
    }
    return {
      backgroundColor: BG,
      color: [RCOLS.Drainage, RCOLS.Neutral, RCOLS.Backpressure],
      legend: {
        data: ["Drainage", "Neutral", "Backpressure"],
        top: 4, textStyle: { color: "#cbd5e1" },
      },
      tooltip: {
        ...TT, trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: "#475569" } },
      },
      singleAxis: {
        type: "time",
        bottom: 42, height: "76%",
        ...AX,
        axisPointer: { show: true, lineStyle: { color: "#475569" } },
      },
      series: [{
        type: "themeRiver",
        emphasis: { focus: "series" },
        label: { show: false },
        data,
      }],
    }
  }, [daily, regimes])

  /* ── 6. Polar bar – diurnal conductance clock face ──────────────── */
  const opt6 = useMemo(() => {
    const buckets = Array.from({ length: 24 }, () => [])
    for (const r of records) {
      if (r.conductance_top_us_cm != null && r.datetime) {
        buckets[r.datetime.toDate().getHours()].push(r.conductance_top_us_cm)
      }
    }
    const vals = buckets.map(b => b.length ? +avg(b).toFixed(0) : 0)
    const minV = Math.min(...vals.filter(Boolean))
    const maxV = Math.max(...vals)
    const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`)
    return {
      backgroundColor: BG,
      tooltip: {
        ...TT, trigger: "item",
        formatter: p => `${hours[p.dataIndex]}<br/>Mean conductance: <b>${p.value} µS/cm</b>`,
      },
      angleAxis: {
        type: "category", data: hours, startAngle: 90,
        axisLine: { lineStyle: { color: "#475569" } },
        axisLabel: { color: "#94a3b8", fontSize: 9 },
        splitLine: { lineStyle: { color: "#334155" } },
      },
      radiusAxis: {
        min: Math.max(0, minV - 30),
        axisLine: { show: false },
        axisLabel: { color: "#94a3b8", fontSize: 9 },
        splitLine: { lineStyle: { color: "#334155" } },
      },
      polar: { radius: ["22%", "88%"] },
      series: [{
        type: "bar",
        coordinateSystem: "polar",
        data: vals,
        itemStyle: {
          color: params => {
            const t = (vals[params.dataIndex] - minV) / Math.max(maxV - minV, 1)
            // interpolate #38bdf8 (low) → #f97316 (high)
            const r = Math.round(56  + t * (249 - 56))
            const g = Math.round(189 + t * (115 - 189))
            const b = Math.round(248 + t * (22  - 248))
            return `rgb(${r},${g},${b})`
          },
        },
      }],
    }
  }, [records])

  /* ── 7. Boxplot – monthly surface temperature distributions ────── */
  const opt7 = useMemo(() => {
    const byMonth = { July: [], August: [], September: [] }
    for (const r of records) {
      if (r.temp_top_c == null || r.temp_top_c < 15 || !r.datetime) continue
      const m = r.datetime.toDate().getMonth() + 1
      byMonth[m === 7 ? "July" : m === 8 ? "August" : "September"].push(r.temp_top_c)
    }
    const months = ["July", "August", "September"]
    const boxData = months.map(mn => {
      const sv = [...byMonth[mn]].sort((a, b) => a - b)
      if (!sv.length) return [0, 0, 0, 0, 0]
      return [quantile(sv, 0), quantile(sv, 25), quantile(sv, 50), quantile(sv, 75), quantile(sv, 100)]
    })
    const outliers = months.flatMap((mn, mi) => {
      const [, q1, , q3] = boxData[mi]
      const iqr = q3 - q1
      return byMonth[mn]
        .filter(v => v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr)
        .slice(0, 50)
        .map(v => [mi, v])
    })
    return {
      backgroundColor: BG,
      tooltip: { ...TT, trigger: "item" },
      grid: { top: 36, right: 20, bottom: 46, left: 62 },
      xAxis: { type: "category", data: months, ...AX },
      yAxis: { type: "value", name: "Surface Temp (°C)", min: 27, ...AX },
      series: [
        {
          type: "boxplot",
          data: boxData,
          boxWidth: ["35%", "55%"],
          itemStyle: {
            color: params => [MCOLS.July, MCOLS.August, MCOLS.September][params.dataIndex],
            borderColor: "#e2e8f0", borderWidth: 1.5,
          },
        },
        {
          type: "scatter", data: outliers, symbolSize: 4,
          itemStyle: { color: "#94a3b8", opacity: 0.55 },
          tooltip: { formatter: p => `Outlier: ${(+p.data[1]).toFixed(2)} °C` },
        },
      ],
    }
  }, [records])

  /* ── 8. Scatter + visualMap – conductance stratification ─────────── */
  const opt8 = useMemo(() => {
    const pts = daily
      .filter(d => d.meanCondTop != null && d.meanCondBot != null && d.meanSalBot != null)
      .map(d => [Math.min(d.meanCondTop, condP95), Math.min(d.meanCondBot, condP95), d.meanSalBot, d.date])
    const maxSal = Math.max(0.1, ...pts.map(p => p[2]))
    return {
      backgroundColor: BG,
      tooltip: {
        ...TT, trigger: "item",
        formatter: p => p.seriesName === "y=x"
          ? null
          : `${p.data[3]}<br/>Surface: ${p.data[0]} µS/cm<br/>Bottom: ${p.data[1]} µS/cm<br/>Salinity: ${p.data[2]} ppt`,
      },
      visualMap: {
        dimension: 2, min: 0, max: maxSal, calculable: true,
        seriesIndex: 0,
        orient: "vertical", right: 8, top: "18%", bottom: "18%",
        inRange: { color: ["#1e3a5f", "#38bdf8", "#f97316", "#ef4444"] },
        text: ["Saltier", "Fresher"], textStyle: { color: "#94a3b8" },
      },
      grid: { top: 36, right: 90, bottom: 46, left: 72 },
      xAxis: { type: "value", name: "Surface Cond (µS/cm)", max: condP95, ...AX },
      yAxis: { type: "value", name: "Bottom Cond (µS/cm)", max: condP95, ...AX },
      series: [
        {
          type: "scatter", name: "Daily", data: pts, symbolSize: 8,
          encode: { x: 0, y: 1 },
        },
        {
          type: "line", name: "y=x",
          data: [[0, 0], [condP95, condP95]],
          lineStyle: { color: "#f59e0b", type: "dashed", width: 1.5 },
          symbol: "none", silent: true,
          tooltip: { show: false }, z: 0,
        },
      ],
    }
  }, [daily, condP95])

  /* ── 9. Line with markArea – water level + storm windows ────────── */
  const opt9 = useMemo(() => {
    const lineData = daily.filter(d => d.meanLevel != null).map(d => [d.date, d.meanLevel])
    const meanLv = lineData.length ? +avg(lineData.map(p => p[1])).toFixed(3) : 0
    // build storm episode windows (consecutive rain days, allow 1-day gap)
    const areas = []
    let start = null
    daily.forEach((d, i) => {
      if (d.rain >= 0.5) {
        if (start === null) start = d.date
      } else {
        if (start !== null) {
          areas.push([{ xAxis: start }, { xAxis: daily[i - 1].date }])
          start = null
        }
      }
    })
    if (start !== null) areas.push([{ xAxis: start }, { xAxis: daily[daily.length - 1].date }])
    return {
      backgroundColor: BG,
      toolbox: TOOLBOX,
      tooltip: { trigger: "axis", ...TT, axisPointer: { lineStyle: { color: "#475569" } } },
      dataZoom: [
        { type: "inside", start: 0, end: 100 },
        { ...SLIDER_DZ, start: 0, end: 100 },
      ],
      grid: { top: 36, right: 20, bottom: 60, left: 60 },
      xAxis: { type: "time", ...AX },
      yAxis: { type: "value", name: "Water Level (ft)", ...AX },
      series: [{
        type: "line", data: lineData, showSymbol: false,
        lineStyle: { color: "#38bdf8", width: 1.5 },
        areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: "rgba(56,189,248,0.2)" }, { offset: 1, color: "rgba(56,189,248,0)" }] } },
        markArea: {
          silent: true,
          itemStyle: { color: "rgba(249,115,22,0.15)", borderColor: "rgba(249,115,22,0.3)", borderWidth: 1 },
          data: areas,
        },
        markLine: {
          silent: true, symbol: "none",
          data: [{ yAxis: meanLv, name: "Season mean" }],
          lineStyle: { color: "#94a3b8", type: "dashed", width: 1 },
          label: { formatter: `Mean: ${meanLv} ft`, color: "#94a3b8", fontSize: 10 },
        },
      }],
    }
  }, [daily])

  /* ── 10. Cartesian heatmap – hour × week temperature ────────────── */
  const opt10 = useMemo(() => {
    const startDate = new Date("2025-07-01T00:00:00")
    const buckets = new Map()
    for (const r of records) {
      if (r.temp_top_c == null || r.temp_top_c < 15 || !r.datetime) continue
      const dt = r.datetime.toDate()
      const hour = dt.getHours()
      const week = Math.floor((dt - startDate) / (86400000 * 7))
      const key = `${week}|${hour}`
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key).push(r.temp_top_c)
    }
    const weekSet = new Set()
    const rawData = []
    for (const [key, vals] of buckets) {
      const [week, hour] = key.split("|").map(Number)
      weekSet.add(week)
      rawData.push({ week, hour, val: +avg(vals).toFixed(2) })
    }
    const weeks = [...weekSet].sort((a, b) => a - b)
    const weekLabels = weeks.map(w => {
      const d = new Date(startDate.getTime() + w * 7 * 86400000)
      return `${d.toLocaleString("en-US", { month: "short" })} ${d.getDate()}`
    })
    const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`)
    const data = rawData.map(({ week, hour, val }) => [weeks.indexOf(week), hour, val])
    const allVals = rawData.map(d => d.val)
    return {
      backgroundColor: BG,
      tooltip: {
        ...TT, trigger: "item",
        formatter: p => `Week of ${weekLabels[p.data[0]]}<br/>${hours[p.data[1]]}<br/><b>${p.data[2]} °C</b>`,
      },
      visualMap: {
        min: Math.min(...allVals), max: Math.max(...allVals),
        calculable: true, orient: "horizontal", left: "center", bottom: 0,
        inRange: { color: ["#1e3a5f", "#38bdf8", "#f97316", "#ef4444"] },
        textStyle: { color: "#94a3b8" },
      },
      grid: { top: 16, right: 20, bottom: 58, left: 56 },
      xAxis: {
        type: "category", data: weekLabels, ...AX,
        axisLabel: { ...AX.axisLabel, rotate: 35, fontSize: 10 },
      },
      yAxis: {
        type: "category", data: hours, ...AX,
        axisLabel: { ...AX.axisLabel, fontSize: 10 },
        splitArea: { show: true, areaStyle: { color: ["rgba(30,41,59,0.5)", "rgba(15,23,42,0.5)"] } },
      },
      series: [{
        type: "heatmap", data,
        itemStyle: { borderColor: "#0f172a", borderWidth: 0.5 },
      }],
    }
  }, [records])

  /* ── early returns (after all hooks) ─────────────────────────────── */
  if (loading) return <p style={{ color: "#94a3b8", padding: 32 }}>Loading data...</p>
  if (error)   return <p style={{ color: "#f87171", padding: 32 }}>Error: {error}</p>

  /* ─────────────────────────────────────────────────────────────────── */
  return (
    <div style={pageStyle}>
      <h1>Apache ECharts</h1>
      <p>
        Full 3 months &middot; 15-min intervals &middot; USGS site 2286328 &middot; Daily
        aggregates + raw records
      </p>
      <p style={descStyle}>
        Apache ECharts renders every chart to a single{" "}
        <strong style={{ color: "#f8fafc" }}>{"<canvas>"}</strong> element using its own
        ZRender rendering engine, which batch-paints the entire scene graph on each frame.
        Unlike Chart.js (which also uses canvas), ECharts uses a retained-mode scene graph
        internally so individual elements remain addressable for hover, animation, and
        brush interaction even at large scales. The{" "}
        <code>echarts-for-react</code> package wraps each chart as a React component and
        bridges option updates to the underlying ECharts instance via{" "}
        <code>notMerge</code> / <code>lazyUpdate</code> flags. ECharts' coordinate system
        model is unique: a single chart can host multiple independent coordinate systems
        (Cartesian, polar, calendar, parallel, singleAxis) simultaneously, enabling chart
        types like the calendar heatmap and polar bar without any custom layout code.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", margin: "0.75rem 0 0.5rem", fontSize: "0.82rem" }}>
        <div>
          <div style={{ color: "#34d399", fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Strengths</div>
          <ul style={{ margin: 0, paddingLeft: "1.15rem", color: "#94a3b8", lineHeight: 1.5 }}>
            <li>Retained-mode canvas: hover, animation, and brush work at 8,832 points without pre-thinning the data</li>
            <li>Multiple coordinate systems coexist in one chart option (Cartesian, polar, calendar, parallel)</li>
            <li>Built-in <code>dataZoom</code> with <code>sampling: "lttb"</code> for raw time-series panning at any zoom level</li>
            <li>Rich exotic types: sunburst, themeRiver, polar bar, boxplot with outlier scatter, visualMap</li>
          </ul>
        </div>
        <div>
          <div style={{ color: "#f87171", fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Limitations</div>
          <ul style={{ margin: 0, paddingLeft: "1.15rem", color: "#94a3b8", lineHeight: 1.5 }}>
            <li>Very large bundle (~1.15 MB gzip): must be lazy-loaded</li>
            <li>Deeply nested JSON option API: finding the right property path often requires documentation lookups</li>
            <li>echarts-for-react is a thin wrapper with limited React-idiomatic utilities: no individual series hooks</li>
            <li>TypeScript types are incomplete and documentation is partially untranslated from Chinese</li>
          </ul>
        </div>
      </div>

      {/* ── 1. Raw time series with dataZoom ─────────────────────── */}
      <h2 style={headingStyle}>1. Line – Raw 15-Min Time Series with dataZoom + LTTB</h2>
      <p style={descStyle}>
        All 8,832 water level readings are passed directly to ECharts without pre-aggregation.
        Two complementary <code>dataZoom</code> components are declared in the option: one{" "}
        <code>type: "inside"</code> (scroll-to-zoom, drag-to-pan on the chart area) and one{" "}
        <code>type: "slider"</code> (the brush bar below). Both are configured in the same
        flat array: no plugin loading needed. When the viewport contains more data points
        than canvas pixels, <code>sampling: "lttb"</code> (Largest-Triangle-Three-Buckets)
        automatically downsamples the visible series, preserving visual shape without
        rendering points that would overlap at the current zoom level.{" "}
        <code>large: true</code> bypasses ECharts' per-element event system for this series
        and switches to a faster batch canvas draw path, the same trade-off as Chart.js's{" "}
        <code>animation: false</code> but with data-adaptive sampling on top.
      </p>
      <div style={boxStyle}>
        <ReactECharts {...EC} option={opt1} style={{ height: 360 }} />
      </div>

      {/* ── 2. Calendar heatmap ──────────────────────────────────── */}
      <h2 style={headingStyle}>2. Calendar Heatmap – Daily Rainfall Grid</h2>
      <p style={descStyle}>
        ECharts has a built-in <strong>calendar</strong> coordinate system: a 52-week
        Sunday-anchored grid where each cell is one day. Setting{" "}
        <code>coordinateSystem: "calendar"</code> on a heatmap series automatically maps{" "}
        <code>[date, value]</code> pairs into the grid with no layout code. No other library
        in this project has this: D3 needs a custom day-of-week / week-of-year layout
        function, and Google Charts' calendar type is a separate package. The{" "}
        <code>visualMap</code> component (shared by charts 2, 8, and 10) maps the rainfall
        value to a 4-stop colour gradient and renders a draggable colour legend: hover any
        cell to see the exact daily rainfall total. Dark cells are storm days; blue cells are
        light rain; dark navy cells are dry days.
      </p>
      <div style={boxStyle}>
        <ReactECharts {...EC} option={opt2} style={{ height: 260 }} />
      </div>

      {/* ── 3. Parallel coordinates ───────────────────────────────── */}
      <h2 style={headingStyle}>3. Parallel Coordinates – Daily Variable Explorer</h2>
      <p style={descStyle}>
        ECharts' <strong>parallel</strong> coordinate system renders a multi-axis projection
        with five axes: rainfall, water level, surface temperature, surface conductance
        (capped at p95), and bottom salinity. Each daily record is a polyline crossing all
        five axes, coloured by month. The three series (July / August / September) overlap at
        0.45 opacity so dense clusters and crossings are visible. In ECharts, brushing is
        available by clicking-and-dragging along any axis to filter lines through a range : 
        the interaction is built into the <code>parallel</code> coordinate type. Plotly's{" "}
        <code>parcoords</code> trace has the same brush filter; D3 requires a fully custom
        brush-per-axis implementation. Look for how July lines (orange) and September lines
        (cyan) diverge on the salinity axis, with September lines reaching higher values.
      </p>
      <div style={boxStyle}>
        <ReactECharts {...EC} option={opt3} style={{ height: 360 }} />
      </div>

      {/* ── 4. Sunburst ──────────────────────────────────────────── */}
      <h2 style={headingStyle}>4. Sunburst – Flow Regime by Month</h2>
      <p style={descStyle}>
        ECharts' <strong>sunburst</strong> chart is a zoomable hierarchical ring chart. The
        three levels here are Wet Season (inner) → Month → Flow Regime (outer). Each day is
        classified from its 5-day rolling mean water level residual: Drainage (green) when
        the canal is above its recent average; Backpressure (red) when below; Neutral (grey)
        otherwise. Click any sector to zoom into that branch; click the centre to return.{" "}
        <code>emphasis.focus: "ancestor"</code> dims non-ancestor rings on hover, making the
        hierarchy readable at any zoom level. The arc sweep of each outer sector is
        proportional to the number of days with that regime in that month: a compact way
        to see whether drainage or backpressure dominated any given month.
      </p>
      <div style={boxStyle}>
        <ReactECharts {...EC} option={opt4} style={{ height: 440 }} />
      </div>

      {/* ── 5. ThemeRiver ────────────────────────────────────────── */}
      <h2 style={headingStyle}>5. ThemeRiver – 7-Day Rolling Regime Composition</h2>
      <p style={descStyle}>
        The <strong>themeRiver</strong> is a temporal stream chart unique to ECharts among
        the libraries in this project. Three streams (Drainage / Neutral / Backpressure) are
        stacked and centred on a zero-baseline: a variant of the streamgraph that emphasises
        relative composition over absolute count. Each point is a 7-day rolling count of how
        many days in the surrounding window were in each regime, producing smooth transitions
        rather than noisy day-to-day flips. ECharts handles the stream layout automatically
        from a flat <code>[date, value, name]</code> array; D3's{" "}
        <code>d3.stack()</code> with <code>stackOffsetWiggle</code> produces the same layout
        but requires manually computing the wiggle baseline. Hover a stream to highlight it.
        Periods where the green Drainage band widens correspond to multi-day freshwater pulses
        after heavy rain.
      </p>
      <div style={boxStyle}>
        <ReactECharts {...EC} option={opt5} style={{ height: 320 }} />
      </div>

      {/* ── 6. Polar bar ─────────────────────────────────────────── */}
      <h2 style={headingStyle}>6. Polar Bar – Diurnal Conductance Clock Face</h2>
      <p style={descStyle}>
        ECharts' <strong>polar</strong> coordinate system replaces the Cartesian grid with
        angular and radial axes. Setting <code>coordinateSystem: "polar"</code> on a{" "}
        <code>bar</code> series produces bars that radiate outward from the centre: one bar
        per hour (0:00 to 23:00), arranged clockwise from the top. The bar length is the
        3-month mean surface conductance at that hour across all 92 days. The colour gradient
        maps from blue (lower conductance, typically early morning) to orange-red (higher
        conductance, typically afternoon) using a per-bar colour function passed to{" "}
        <code>itemStyle.color</code>. Because conductance in this tidal canal responds to
        both solar heating (expansion of saline water) and tidal flushing patterns, the clock
        face reveals whether the daily conductance signal is driven by a consistent tidal
        phase or by temperature-driven density effects.
      </p>
      <div style={boxStyle}>
        <ReactECharts {...EC} option={opt6} style={{ height: 400 }} />
      </div>

      {/* ── 7. Boxplot ───────────────────────────────────────────── */}
      <h2 style={headingStyle}>7. Boxplot – Monthly Surface Temperature Distribution</h2>
      <p style={descStyle}>
        ECharts has a first-class <strong>boxplot</strong> series type that renders the
        5-number summary (min, Q1, median, Q3, max) as a box-whisker from precomputed values.
        In Chart.js this requires the separate{" "}
        <code>@sgratzl/chartjs-chart-boxplot</code> package; in Recharts there is no native
        boxplot type. The box data here is computed from all 8,832 15-minute temperature
        readings (not daily means), so the spread reflects true within-day and between-day
        variability. Outliers beyond 1.5×IQR are plotted as a separate{" "}
        <code>scatter</code> series (grey dots): the standard Tukey convention. Each box
        is coloured by month using a per-item <code>{"itemStyle.color"}</code> function
        (July orange, August purple, September cyan), which ECharts evaluates with{" "}
        <code>params.dataIndex</code>: the same pattern used on the polar bar. Note
        whether the July or September interquartile range is wider: a wider box means
        more day-to-day temperature variability.
      </p>
      <div style={boxStyle}>
        <ReactECharts {...EC} option={opt7} style={{ height: 340 }} />
      </div>

      {/* ── 8. Scatter + visualMap ───────────────────────────────── */}
      <h2 style={headingStyle}>8. Scatter + visualMap – Conductance Stratification</h2>
      <p style={descStyle}>
        The <strong>visualMap</strong> component maps <code>dimension: 2</code> (bottom
        salinity) of each scatter point to a colour on a continuous blue-to-red gradient,
        without any per-point colour function. The mapping is declared entirely in the option
        object: <code>{"visualMap: { dimension: 2, inRange: { color: [...] } }"}</code>. This
        is analogous to Plotly's <code>colorscale</code> but more flexible: the same{" "}
        <code>visualMap</code> can drive opacity, symbol size, or symbol type instead of (or
        in addition to) colour. Points above the gold diagonal have higher bottom conductance
        than surface conductance, indicating denser saline water underflowing the fresh
        surface layer from Biscayne Bay tidal intrusion. The colour adds a third dimension:
        red points above the diagonal are simultaneously saltier: the strongest intrusion
        signal. Drag the colour legend handles to filter which salinity range is visible.
      </p>
      <div style={boxStyle}>
        <ReactECharts {...EC} option={opt8} style={{ height: 360 }} />
      </div>

      {/* ── 9. Line with markArea ───────────────────────────────── */}
      <h2 style={headingStyle}>9. Line with markArea – Water Level and Storm Windows</h2>
      <p style={descStyle}>
        ECharts' <code>markArea</code> and <code>markLine</code> are built-in annotation
        systems that live inside the series option: no external annotation plugin needed (vs
        Chart.js's <code>chartjs-plugin-annotation</code>). Each orange shaded band marks a
        contiguous storm episode (consecutive days with rainfall ≥ 0.5 in), specified as an
        array of <code>{"[{ xAxis: startDate }, { xAxis: endDate }]"}</code> pairs. The
        dashed grey line is a <code>markLine</code> drawn at the season mean water level. Both
        annotations update automatically when the dataZoom slider filters the time window.
        This view makes it easy to see whether the canal's water level was already elevated
        before a storm (antecedent saturation) or whether it starts from a low baseline and
        recovers quickly: information that the ThemeRiver view (chart 5) summarises as a
        stream but cannot show at the individual-event level.
      </p>
      <div style={boxStyle}>
        <ReactECharts {...EC} option={opt9} style={{ height: 360 }} />
      </div>

      {/* ── 10. Cartesian heatmap ───────────────────────────────── */}
      <h2 style={headingStyle}>10. Heatmap – Surface Temperature by Hour and Week</h2>
      <p style={descStyle}>
        A 2-D Cartesian <strong>heatmap</strong> with week of season on the x-axis (13
        columns, each a calendar week starting July 1) and hour of day on the y-axis (24
        rows). Each cell's colour is the mean of all 15-minute surface temperature readings
        in that week-hour bin, mapped through the same <code>visualMap</code> gradient as
        chart 2. The expected pattern (warm afternoons, cool pre-dawn) shows as a warm
        horizontal band at 14:00–17:00 and a cool band at 05:00–07:00. Deviations from that
        pattern are scientifically interesting: a week where the afternoon warming collapses
        (cell becomes bluer in the upper-centre region) corresponds to a period of heavy
        cloud cover and rainfall mixing the water column. The ECharts{" "}
        <code>splitArea</code> option on the y-axis adds alternating row shading (subtle dark
        bands) to make individual hour rows traceable across 13 weeks without gridlines.
      </p>
      <div style={boxStyle}>
        <ReactECharts {...EC} option={opt10} style={{ height: 460 }} />
      </div>
    </div>
  )
}
