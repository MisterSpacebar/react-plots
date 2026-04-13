/**
 * D3Page.jsx
 * -----------
 * Six charts built with raw D3 inside React useRef/useEffect hooks.
 * D3 owns the SVG DOM; React only mounts the container <svg> elements
 * and re-runs effects when data changes. This approach unlocks patterns
 * that declarative libraries cannot offer:
 *   - Free-form SVG brush with linked context/focus views
 *   - Delaunay/Voronoi nearest-neighbor hover
 *   - Streamgraph with d3.stackOffsetWiggle
 *   - Calendar heatmap (arbitrary 2-D grid layout)
 *   - Force-directed collision simulation
 *   - Chord diagram showing variable co-occurrence
 */

import { useEffect, useRef } from "react"
import * as d3 from "d3"
import { useData } from "../DataContext"

/* ─── colour helpers ─────────────────────────────────────────────── */
const MONTH_COLOR = { July: "#f97316", August: "#a855f7", September: "#06b6d4" }
const TEMP_COLOR = d3.scaleSequential(d3.interpolateYlOrRd)
const SAL_COLOR  = d3.scaleSequential(d3.interpolateCool)

/* ─── shared data helpers (mirror Recharts helpers, no import) ────── */
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
      const validTempTop = rows.map(r => r.temp_top_c).filter(v => v != null && v >= 15)
      const validTempBot = rows.map(r => r.temp_bottom_c).filter(v => v != null && v >= 15)
      const salBot = rows.map(r => r.salinity_bottom_ppt).filter(v => v != null)
      const condTop = rows.map(r => r.conductance_top_us_cm).filter(v => v != null)
      return {
        date,
        dt: new Date(date + "T12:00:00"),
        month: monthName,
        monthNum,
        maxRain: d3.max(rows, r => r.rainfall_in) ?? 0,
        meanLevel: avg(rows.map(r => r.water_level_ft).filter(v => v != null)),
        meanTempTop: validTempTop.length ? +avg(validTempTop).toFixed(2) : null,
        meanTempBot: validTempBot.length ? +avg(validTempBot).toFixed(2) : null,
        meanSalBot: salBot.length ? +avg(salBot).toFixed(3) : null,
        meanCondTop: condTop.length ? +avg(condTop).toFixed(0) : null,
      }
    })
}

/* ─── page CSS (inline to keep file self-contained) ─────────────── */
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
const svgWrapStyle = {
  background: "#1e293b",
  borderRadius: 8,
  overflow: "hidden",
  marginBottom: "0.5rem",
}

/* ═══════════════════════════════════════════════════════════════════
   1. Focus + Context Brush  (linked time series)
   D3 renders two panels sharing one x-domain. Dragging on the lower
   context panel updates the x-scale of the detail panel.
   ═══════════════════════════════════════════════════════════════════ */
function BrushChart({ daily }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!daily.length) return
    const el = ref.current
    d3.select(el).selectAll("*").remove()

    const W = el.clientWidth || 900
    const focusH = 200, contextH = 70
    const margin = { top: 14, right: 24, bottom: 0, left: 50 }
    const marginCtx = { top: 6, right: 24, bottom: 28, left: 50 }

    const svg = d3.select(el)
      .append("svg")
      .attr("width", "100%")
      .attr("viewBox", `0 0 ${W} ${focusH + contextH + margin.top + marginCtx.bottom + 20}`)

    const innerW = W - margin.left - margin.right

    /* ── scales ── */
    const xDomain = d3.extent(daily, d => d.dt)
    const xFocus   = d3.scaleTime().domain(xDomain).range([0, innerW])
    const xContext  = d3.scaleTime().domain(xDomain).range([0, innerW])

    const levelExt  = d3.extent(daily, d => d.meanLevel)
    const yFocus    = d3.scaleLinear().domain([levelExt[0] - 0.05, levelExt[1] + 0.05]).range([focusH, 0])
    const yContext  = d3.scaleLinear().domain(yFocus.domain()).range([contextH, 0])

    /* ── clip path ── */
    svg.append("defs").append("clipPath").attr("id", "focus-clip")
      .append("rect").attr("width", innerW).attr("height", focusH)

    /* ── focus group ── */
    const focus = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`)

    const areaFocus = d3.area()
      .defined(d => d.meanLevel != null)
      .x(d => xFocus(d.dt))
      .y0(yFocus(levelExt[0] - 0.05))
      .y1(d => yFocus(d.meanLevel))
      .curve(d3.curveMonotoneX)

    const lineFocus = d3.line()
      .defined(d => d.meanLevel != null)
      .x(d => xFocus(d.dt))
      .y(d => yFocus(d.meanLevel))
      .curve(d3.curveMonotoneX)

    focus.append("g")
      .attr("class", "grid")
      .call(d3.axisLeft(yFocus).ticks(5).tickSize(-innerW).tickFormat(""))
      .call(g => g.select(".domain").remove())
      .call(g => g.selectAll(".tick line").attr("stroke", "#334155"))

    focus.append("path")
      .datum(daily)
      .attr("fill", "rgba(14,165,233,0.18)")
      .attr("d", areaFocus)
      .attr("clip-path", "url(#focus-clip)")

    const focusLine = focus.append("path")
      .datum(daily)
      .attr("fill", "none")
      .attr("stroke", "#38bdf8")
      .attr("stroke-width", 1.5)
      .attr("d", lineFocus)
      .attr("clip-path", "url(#focus-clip)")

    const xAxisFocus = focus.append("g")
      .attr("transform", `translate(0,${focusH})`)
      .call(d3.axisBottom(xFocus).ticks(6).tickFormat(d3.timeFormat("%b %d")))
      .call(g => g.selectAll("text").attr("fill", "#94a3b8").style("font-size", "11px"))
      .call(g => g.select(".domain").attr("stroke", "#475569"))
      .call(g => g.selectAll(".tick line").attr("stroke", "#475569"))

    focus.append("g")
      .call(d3.axisLeft(yFocus).ticks(5))
      .call(g => g.selectAll("text").attr("fill", "#94a3b8").style("font-size", "11px"))
      .call(g => g.select(".domain").attr("stroke", "#475569"))

    focus.append("text")
      .attr("x", -focusH / 2).attr("y", -38)
      .attr("transform", "rotate(-90)")
      .attr("fill", "#64748b").style("font-size", "11px").attr("text-anchor", "middle")
      .text("Water Level (ft)")

    /* ── hover crosshair ── */
    const bisect = d3.bisector(d => d.dt).center
    const hoverLine = focus.append("line")
      .attr("stroke", "#f59e0b").attr("stroke-width", 1).attr("stroke-dasharray", "4 2")
      .attr("y1", 0).attr("y2", focusH).attr("opacity", 0)
    const hoverCircle = focus.append("circle")
      .attr("r", 4).attr("fill", "#f59e0b").attr("stroke", "#fef3c7").attr("stroke-width", 1).attr("opacity", 0)
    const hoverText = focus.append("text")
      .attr("fill", "#fef3c7").style("font-size", "11px").attr("text-anchor", "middle").attr("opacity", 0)

    focus.append("rect")
      .attr("width", innerW).attr("height", focusH)
      .attr("fill", "none").attr("pointer-events", "all")
      .on("mousemove", function (event) {
        const [mx] = d3.pointer(event)
        const date = xFocus.invert(mx)
        const i = bisect(daily, date)
        const d = daily[i]
        if (!d || d.meanLevel == null) return
        const cx = xFocus(d.dt)
        const cy = yFocus(d.meanLevel)
        hoverLine.attr("x1", cx).attr("x2", cx).attr("opacity", 1)
        hoverCircle.attr("cx", cx).attr("cy", cy).attr("opacity", 1)
        hoverText.attr("x", cx).attr("y", cy - 10).attr("opacity", 1)
          .text(`${d3.timeFormat("%b %d")(d.dt)}: ${d.meanLevel} ft`)
      })
      .on("mouseleave", () => {
        hoverLine.attr("opacity", 0)
        hoverCircle.attr("opacity", 0)
        hoverText.attr("opacity", 0)
      })

    /* ── context group ── */
    const ctxTop = focusH + margin.top + 20
    const context = svg.append("g")
      .attr("transform", `translate(${marginCtx.left},${ctxTop})`)

    const areaCtx = d3.area()
      .defined(d => d.meanLevel != null)
      .x(d => xContext(d.dt))
      .y0(contextH)
      .y1(d => yContext(d.meanLevel))
      .curve(d3.curveMonotoneX)

    context.append("path")
      .datum(daily)
      .attr("fill", "rgba(14,165,233,0.25)")
      .attr("d", areaCtx)

    context.append("path")
      .datum(daily)
      .attr("fill", "none")
      .attr("stroke", "#38bdf8")
      .attr("stroke-width", 0.8)
      .attr("d", d3.line().defined(d => d.meanLevel != null)
        .x(d => xContext(d.dt)).y(d => yContext(d.meanLevel)).curve(d3.curveMonotoneX))

    context.append("g")
      .attr("transform", `translate(0,${contextH})`)
      .call(d3.axisBottom(xContext).ticks(8).tickFormat(d3.timeFormat("%b %d")))
      .call(g => g.selectAll("text").attr("fill", "#94a3b8").style("font-size", "10px"))
      .call(g => g.select(".domain").attr("stroke", "#475569"))
      .call(g => g.selectAll(".tick line").attr("stroke", "#475569"))

    context.append("text")
      .attr("x", innerW / 2).attr("y", contextH + 26)
      .attr("fill", "#64748b").style("font-size", "10px").attr("text-anchor", "middle")
      .text("Drag to zoom the detail view above")

    /* ── brush ── */
    const brush = d3.brushX()
      .extent([[0, 0], [innerW, contextH]])
      .on("brush end", ({ selection }) => {
        if (!selection) {
          xFocus.domain(xDomain)
        } else {
          xFocus.domain(selection.map(xContext.invert))
        }
        focusLine.attr("d", lineFocus)
        focus.selectAll("path[fill]").attr("d", areaFocus)
        xAxisFocus.call(d3.axisBottom(xFocus).ticks(6).tickFormat(d3.timeFormat("%b %d")))
          .call(g => g.selectAll("text").attr("fill", "#94a3b8").style("font-size", "11px"))
          .call(g => g.select(".domain").attr("stroke", "#475569"))
          .call(g => g.selectAll(".tick line").attr("stroke", "#475569"))
      })

    const brushG = context.append("g").call(brush)
    brushG.select(".selection")
      .attr("fill", "rgba(248,200,50,0.2)")
      .attr("stroke", "#f59e0b")
      .attr("stroke-width", 1)
    brushG.call(brush.move, [0, innerW * 0.35])
  }, [daily])

  return <div ref={ref} style={svgWrapStyle} />
}

/* ═══════════════════════════════════════════════════════════════════
   2. Voronoi Scatter  (nearest-point hover via Delaunay triangulation)
   Each point is coloured by month; hovering anywhere snaps to the
   geometrically closest point regardless of cursor precision.
   ═══════════════════════════════════════════════════════════════════ */
function VoronoiScatter({ daily }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!daily.length) return
    const el = ref.current
    d3.select(el).selectAll("*").remove()

    const W = el.clientWidth || 900
    const H = 320
    const margin = { top: 16, right: 24, bottom: 44, left: 56 }
    const iW = W - margin.left - margin.right
    const iH = H - margin.top - margin.bottom

    const data = daily.filter(d => d.meanTempTop != null && d.meanSalBot != null)

    const svg = d3.select(el).append("svg")
      .attr("width", "100%").attr("viewBox", `0 0 ${W} ${H}`)

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`)

    const xS = d3.scaleLinear()
      .domain(d3.extent(data, d => d.meanTempTop)).nice()
      .range([0, iW])
    const yS = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.meanSalBot) * 1.05]).nice()
      .range([iH, 0])

    /* grid */
    g.append("g").call(d3.axisLeft(yS).ticks(5).tickSize(-iW).tickFormat(""))
      .call(gr => gr.select(".domain").remove())
      .call(gr => gr.selectAll(".tick line").attr("stroke", "#334155"))
    g.append("g").attr("transform", `translate(0,${iH})`)
      .call(d3.axisBottom(xS).ticks(6).tickSize(-iH).tickFormat(""))
      .call(gr => gr.select(".domain").remove())
      .call(gr => gr.selectAll(".tick line").attr("stroke", "#334155"))

    /* axes */
    g.append("g").attr("transform", `translate(0,${iH})`)
      .call(d3.axisBottom(xS).ticks(6).tickFormat(v => `${v} C`))
      .call(gr => gr.selectAll("text").attr("fill", "#94a3b8").style("font-size", "11px"))
      .call(gr => gr.select(".domain").attr("stroke", "#475569"))
    g.append("g").call(d3.axisLeft(yS).ticks(5))
      .call(gr => gr.selectAll("text").attr("fill", "#94a3b8").style("font-size", "11px"))
      .call(gr => gr.select(".domain").attr("stroke", "#475569"))

    g.append("text").attr("x", iW / 2).attr("y", iH + 36)
      .attr("fill", "#64748b").style("font-size", "11px").attr("text-anchor", "middle")
      .text("Daily Mean Water Temperature Top (C)")
    g.append("text").attr("x", -iH / 2).attr("y", -44).attr("transform", "rotate(-90)")
      .attr("fill", "#64748b").style("font-size", "11px").attr("text-anchor", "middle")
      .text("Salinity Bottom (ppt)")

    /* dots */
    g.append("g").selectAll("circle")
      .data(data).join("circle")
      .attr("cx", d => xS(d.meanTempTop))
      .attr("cy", d => yS(d.meanSalBot))
      .attr("r", 4)
      .attr("fill", d => MONTH_COLOR[d.month])
      .attr("opacity", 0.7)
      .attr("stroke", "#1e293b")
      .attr("stroke-width", 0.5)

    /* legend */
    const months = ["July", "August", "September"]
    const leg = svg.append("g").attr("transform", `translate(${margin.left + iW - 110},${margin.top + 8})`)
    months.forEach((m, i) => {
      leg.append("circle").attr("cx", 6).attr("cy", i * 18).attr("r", 5).attr("fill", MONTH_COLOR[m])
      leg.append("text").attr("x", 16).attr("y", i * 18 + 4)
        .attr("fill", "#cbd5e1").style("font-size", "11px").text(m)
    })

    /* Delaunay / Voronoi */
    const points = data.map(d => [xS(d.meanTempTop), yS(d.meanSalBot)])
    const delaunay = d3.Delaunay.from(points)

    const tooltip = d3.select(el).append("div")
      .style("position", "absolute").style("pointer-events", "none")
      .style("background", "#0f172a").style("border", "1px solid #334155")
      .style("border-radius", "6px").style("padding", "7px 10px")
      .style("font-size", "11px").style("color", "#e2e8f0")
      .style("opacity", 0)

    let highlight = g.append("circle").attr("r", 7)
      .attr("fill", "none").attr("stroke", "#f59e0b").attr("stroke-width", 2).attr("opacity", 0)

    svg.append("rect")
      .attr("x", margin.left).attr("y", margin.top).attr("width", iW).attr("height", iH)
      .attr("fill", "none").attr("pointer-events", "all")
      .on("mousemove", function (event) {
        const [mx, my] = d3.pointer(event, this)
        const px = mx - margin.left, py = my - margin.top
        const i = delaunay.find(px, py)
        if (i < 0) return
        const d = data[i]
        highlight.attr("cx", xS(d.meanTempTop)).attr("cy", yS(d.meanSalBot)).attr("opacity", 1)
        tooltip.style("opacity", 1)
          .style("left", (event.offsetX + 12) + "px")
          .style("top", (event.offsetY - 28) + "px")
          .html(`<strong>${d.date}</strong><br>${d.month}<br>Temp: ${d.meanTempTop} C<br>Salinity: ${d.meanSalBot} ppt`)
      })
      .on("mouseleave", () => {
        highlight.attr("opacity", 0)
        tooltip.style("opacity", 0)
      })
  }, [daily])

  return <div ref={ref} style={{ ...svgWrapStyle, position: "relative" }} />
}

/* ═══════════════════════════════════════════════════════════════════
   3. Streamgraph  (d3.stackOffsetWiggle flowing streams)
   Shows the relative presence of rainfall, temperature anomaly, and
   water-level anomaly across the season as flowing organic shapes.
   ═══════════════════════════════════════════════════════════════════ */
function Streamgraph({ daily }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!daily.length) return
    const el = ref.current
    d3.select(el).selectAll("*").remove()

    const W = el.clientWidth || 900
    const H = 280
    const margin = { top: 12, right: 24, bottom: 36, left: 50 }
    const iW = W - margin.left - margin.right
    const iH = H - margin.top - margin.bottom

    /* normalise three signals to [0,1] for comparable stream bands */
    const maxRain = d3.max(daily, d => d.maxRain) || 1
    const allTemps = daily.map(d => d.meanTempTop).filter(v => v != null)
    const tempMean = d3.mean(allTemps)
    const tempStd  = d3.deviation(allTemps) || 1
    const allLevels = daily.map(d => d.meanLevel).filter(v => v != null)
    const levelMean = d3.mean(allLevels)
    const levelStd  = d3.deviation(allLevels) || 1

    const stackData = daily.map(d => ({
      dt: d.dt,
      rain: d.maxRain / maxRain,
      tempAnom: Math.max(0, d.meanTempTop != null ? (d.meanTempTop - tempMean) / tempStd * 0.3 + 0.3 : 0.3),
      levelAnom: Math.max(0, d.meanLevel != null ? (d.meanLevel - levelMean) / levelStd * 0.3 + 0.3 : 0.3),
    }))

    const keys = ["rain", "tempAnom", "levelAnom"]
    const COLORS = ["#6366f1", "#f97316", "#06b6d4"]

    const stack = d3.stack()
      .keys(keys)
      .offset(d3.stackOffsetWiggle)
      .order(d3.stackOrderInsideOut)

    const series = stack(stackData)

    const xS = d3.scaleTime()
      .domain(d3.extent(daily, d => d.dt))
      .range([0, iW])
    const yS = d3.scaleLinear()
      .domain([d3.min(series, s => d3.min(s, d => d[0])), d3.max(series, s => d3.max(s, d => d[1]))])
      .range([iH, 0])

    const areaGen = d3.area()
      .x((_, i) => xS(stackData[i].dt))
      .y0(d => yS(d[0]))
      .y1(d => yS(d[1]))
      .curve(d3.curveBasis)

    const svg = d3.select(el).append("svg")
      .attr("width", "100%").attr("viewBox", `0 0 ${W} ${H}`)
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`)

    g.selectAll("path")
      .data(series).join("path")
      .attr("fill", (_, i) => COLORS[i])
      .attr("opacity", 0.78)
      .attr("d", areaGen)

    g.append("g").attr("transform", `translate(0,${iH})`)
      .call(d3.axisBottom(xS).ticks(8).tickFormat(d3.timeFormat("%b %d")))
      .call(gr => gr.selectAll("text").attr("fill", "#94a3b8").style("font-size", "11px"))
      .call(gr => gr.select(".domain").attr("stroke", "#475569"))

    /* no y-axis: wiggle offset produces an arbitrary baseline */
    const labels = ["Daily Rainfall (norm.)", "Temp Anomaly (norm.)", "Water Level Anomaly (norm.)"]
    const leg = svg.append("g").attr("transform", `translate(${margin.left + 8},${margin.top + 8})`)
    labels.forEach((l, i) => {
      leg.append("rect").attr("x", 0).attr("y", i * 18).attr("width", 12).attr("height", 12)
        .attr("fill", COLORS[i]).attr("rx", 2)
      leg.append("text").attr("x", 18).attr("y", i * 18 + 10)
        .attr("fill", "#cbd5e1").style("font-size", "11px").text(l)
    })
  }, [daily])

  return <div ref={ref} style={svgWrapStyle} />
}

/* ═══════════════════════════════════════════════════════════════════
   4. Calendar Heatmap  (2-D grid layout)
   Rows = weeks, columns = weekday. Every cell is coloured by the
   daily mean water level. Date arithmetic is handled entirely by D3
   time utilities. There is no equivalent in Chart.js or Recharts.
   ═══════════════════════════════════════════════════════════════════ */
function CalendarHeatmap({ daily }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!daily.length) return
    const el = ref.current
    d3.select(el).selectAll("*").remove()

    const W = el.clientWidth || 900
    const margin = { top: 30, right: 24, bottom: 36, left: 36 }
    const cellSize = Math.floor((W - margin.left - margin.right) / 14) // ~14 weeks of data
    const H = cellSize * 7 + margin.top + margin.bottom

    const byDate = new Map(daily.map(d => [d.date, d.meanLevel]))
    const ext = d3.extent(daily, d => d.meanLevel)
    const color = d3.scaleSequential(d3.interpolatePlasma).domain([ext[0], ext[1]])

    const startDate = daily[0].dt
    const getWeekIndex = dt => Math.floor((dt - d3.timeMonday.floor(startDate)) / (7 * 24 * 3600 * 1000))
    const getDayIndex  = dt => (dt.getDay() + 6) % 7 // Mon=0 ... Sun=6

    const svg = d3.select(el).append("svg")
      .attr("width", "100%").attr("viewBox", `0 0 ${W} ${H}`)
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`)

    /* day-of-week labels */
    const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    dayLabels.forEach((l, i) => {
      g.append("text").attr("x", -4).attr("y", i * cellSize + cellSize * 0.65)
        .attr("fill", "#64748b").style("font-size", "10px").attr("text-anchor", "end").text(l)
    })

    /* cells */
    const tooltip = d3.select(el).append("div")
      .style("position", "absolute").style("pointer-events", "none")
      .style("background", "#0f172a").style("border", "1px solid #334155")
      .style("border-radius", "6px").style("padding", "6px 10px")
      .style("font-size", "11px").style("color", "#e2e8f0").style("opacity", 0)

    daily.forEach(d => {
      const week = getWeekIndex(d.dt)
      const day  = getDayIndex(d.dt)
      const val  = d.meanLevel
      g.append("rect")
        .attr("x", week * cellSize + 1)
        .attr("y", day * cellSize + 1)
        .attr("width", cellSize - 2)
        .attr("height", cellSize - 2)
        .attr("rx", 3)
        .attr("fill", val != null ? color(val) : "#1e293b")
        .attr("stroke", "#0f172a")
        .attr("stroke-width", 1)
        .on("mouseover", function (event) {
          d3.select(this).attr("stroke", "#f59e0b").attr("stroke-width", 2)
          tooltip.style("opacity", 1)
            .style("left", (event.offsetX + 10) + "px")
            .style("top", (event.offsetY - 36) + "px")
            .html(`<strong>${d.date}</strong><br>Level: ${val != null ? val + " ft" : "n/a"}<br>Rain: ${d.maxRain}" in`)
        })
        .on("mouseout", function () {
          d3.select(this).attr("stroke", "#0f172a").attr("stroke-width", 1)
          tooltip.style("opacity", 0)
        })
    })

    /* month labels above week columns */
    const monthStarts = d3.timeMonth.range(daily[0].dt, d3.timeDay.offset(daily[daily.length - 1].dt, 1))
    monthStarts.forEach(ms => {
      const week = getWeekIndex(ms)
      if (week < 0) return
      g.append("text")
        .attr("x", week * cellSize + cellSize / 2)
        .attr("y", -8)
        .attr("fill", "#94a3b8").style("font-size", "11px").attr("text-anchor", "middle")
        .text(d3.timeFormat("%B")(ms))
    })

    /* colour legend bar */
    const legendW = Math.min(240, iW => iW)
    const lgX = W - margin.right - 200
    const lgY = H - margin.bottom + 4
    const defs = svg.append("defs")
    const lgGrad = defs.append("linearGradient").attr("id", "cal-grad").attr("x1", "0%").attr("x2", "100%")
    lgGrad.selectAll("stop")
      .data(d3.range(0, 1.01, 0.1))
      .join("stop")
      .attr("offset", d => `${d * 100}%`)
      .attr("stop-color", d => color(ext[0] + d * (ext[1] - ext[0])))
    svg.append("rect")
      .attr("x", lgX).attr("y", lgY)
      .attr("width", 200).attr("height", 12).attr("rx", 4)
      .attr("fill", "url(#cal-grad)")
    svg.append("text").attr("x", lgX).attr("y", lgY + 24)
      .attr("fill", "#64748b").style("font-size", "10px").text(`${ext[0].toFixed(1)} ft`)
    svg.append("text").attr("x", lgX + 200).attr("y", lgY + 24)
      .attr("fill", "#64748b").style("font-size", "10px").attr("text-anchor", "end").text(`${ext[1].toFixed(1)} ft`)
    svg.append("text").attr("x", lgX + 100).attr("y", lgY + 24)
      .attr("fill", "#64748b").style("font-size", "10px").attr("text-anchor", "middle").text("Water Level")
  }, [daily])

  return <div ref={ref} style={{ ...svgWrapStyle, position: "relative" }} />
}

/* ═══════════════════════════════════════════════════════════════════
   5. Force-Directed Bubble Chart  (collision simulation)
   Storm days are bubbles sized by rainfall, coloured by month, and
   physically repelled from each other via d3.forceSimulation.
   The final resting positions are aesthetically clustered but
   not on a fixed axis: the simulation decides layout.
   ═══════════════════════════════════════════════════════════════════ */
function ForceBubble({ daily }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!daily.length) return
    const el = ref.current
    d3.select(el).selectAll("*").remove()

    const W = el.clientWidth || 900
    const H = 340

    const stormDays = daily.filter(d => d.maxRain >= 0.1)
    const rScale = d3.scaleSqrt()
      .domain([0, d3.max(stormDays, d => d.maxRain)])
      .range([4, 34])

    const nodes = stormDays.map(d => ({
      ...d,
      r: rScale(d.maxRain),
      x: W / 2 + (Math.random() - 0.5) * 120,
      y: H / 2 + (Math.random() - 0.5) * 80,
    }))

    /* cluster x by month */
    const monthX = { July: W * 0.22, August: W * 0.5, September: W * 0.78 }

    const sim = d3.forceSimulation(nodes)
      .force("x", d3.forceX(d => monthX[d.month]).strength(0.08))
      .force("y", d3.forceY(H / 2).strength(0.06))
      .force("collide", d3.forceCollide(d => d.r + 2).strength(0.85))
      .stop()

    for (let i = 0; i < 300; i++) sim.tick()

    const svg = d3.select(el).append("svg")
      .attr("width", "100%").attr("viewBox", `0 0 ${W} ${H}`)

    /* month column headings */
    Object.entries(monthX).forEach(([m, x]) => {
      svg.append("text").attr("x", x).attr("y", 22)
        .attr("fill", MONTH_COLOR[m]).style("font-size", "13px").style("font-weight", 700)
        .attr("text-anchor", "middle").text(m)
    })

    const tooltip = d3.select(el).append("div")
      .style("position", "absolute").style("pointer-events", "none")
      .style("background", "#0f172a").style("border", "1px solid #334155")
      .style("border-radius", "6px").style("padding", "6px 10px")
      .style("font-size", "11px").style("color", "#e2e8f0").style("opacity", 0)

    svg.selectAll("circle")
      .data(nodes).join("circle")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", d => d.r)
      .attr("fill", d => MONTH_COLOR[d.month])
      .attr("opacity", 0.8)
      .attr("stroke", "#0f172a")
      .attr("stroke-width", 1.5)
      .on("mouseover", function (event, d) {
        d3.select(this).attr("stroke", "#f59e0b").attr("stroke-width", 2.5)
        tooltip.style("opacity", 1)
          .style("left", (event.offsetX + 10) + "px")
          .style("top", (event.offsetY - 40) + "px")
          .html(`<strong>${d.date}</strong><br>${d.month}<br>Rain: ${d.maxRain} in`)
      })
      .on("mouseout", function () {
        d3.select(this).attr("stroke", "#0f172a").attr("stroke-width", 1.5)
        tooltip.style("opacity", 0)
      })

    /* rainfall labels on large bubbles */
    svg.selectAll("text.bubble-label")
      .data(nodes.filter(d => d.r > 15)).join("text")
      .attr("class", "bubble-label")
      .attr("x", d => d.x).attr("y", d => d.y + 4)
      .attr("fill", "#0f172a").style("font-size", "10px").style("font-weight", 700)
      .attr("text-anchor", "middle").attr("pointer-events", "none")
      .text(d => d.maxRain + '"')

    /* size legend */
    const legRains = [0.25, 0.5, 1.0, 2.0]
    const legX = 36, legY = H - 16
    legRains.forEach((v, i) => {
      const r = rScale(v)
      const cx = legX + [0, 22, 48, 82][i]
      svg.append("circle").attr("cx", cx).attr("cy", legY - r).attr("r", r)
        .attr("fill", "none").attr("stroke", "#475569").attr("stroke-width", 1)
      svg.append("text").attr("x", cx).attr("y", legY + 10)
        .attr("fill", "#64748b").style("font-size", "9px").attr("text-anchor", "middle").text(v + '"')
    })
    svg.append("text").attr("x", legX).attr("y", legY + 20)
      .attr("fill", "#64748b").style("font-size", "9px").text("bubble size = daily rainfall")
  }, [daily])

  return <div ref={ref} style={{ ...svgWrapStyle, position: "relative" }} />
}

/* ═══════════════════════════════════════════════════════════════════
   6. Chord Diagram  (co-occurrence of extreme-condition days)
   Draws a circle of arcs (months) connected by ribbons whose width
   encodes how many days in each month had simultaneously high
   rainfall (>= 0.5 in), high temperature (>= 31 C), or high
   salinity (>= 1 ppt). Pure D3: no equivalent in the other libs.
   ═══════════════════════════════════════════════════════════════════ */
function ChordDiagram({ daily }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!daily.length) return
    const el = ref.current
    d3.select(el).selectAll("*").remove()

    const W = el.clientWidth || 900
    const H = 400
    const radius = Math.min(W, H) / 2 - 60

    /* build 3x3 co-occurrence matrix across [highRain, highTemp, highSal] */
    const flags = ["High Rain (>=0.5 in)", "High Temp (>=31 C)", "High Salinity (>=1 ppt)"]
    const matrix = Array.from({ length: 3 }, () => Array(3).fill(0))

    daily.forEach(d => {
      const active = [
        d.maxRain >= 0.5,
        d.meanTempTop != null && d.meanTempTop >= 31,
        d.meanSalBot != null && d.meanSalBot >= 1,
      ]
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          if (active[i] && active[j]) matrix[i][j]++
        }
      }
    })

    const COLORS_CHORD = ["#6366f1", "#f97316", "#ef4444"]

    const chord = d3.chord().padAngle(0.04).sortSubgroups(d3.descending)
    const chords = chord(matrix)

    const arc = d3.arc().innerRadius(radius).outerRadius(radius + 20)
    const ribbon = d3.ribbon().radius(radius)

    const svg = d3.select(el).append("svg")
      .attr("width", "100%").attr("viewBox", `0 0 ${W} ${H}`)
    const g = svg.append("g").attr("transform", `translate(${W / 2},${H / 2})`)

    const tooltip = d3.select(el).append("div")
      .style("position", "absolute").style("pointer-events", "none")
      .style("background", "#0f172a").style("border", "1px solid #334155")
      .style("border-radius", "6px").style("padding", "6px 10px")
      .style("font-size", "11px").style("color", "#e2e8f0").style("opacity", 0)

    /* ribbons */
    g.append("g").attr("fill-opacity", 0.65)
      .selectAll("path")
      .data(chords).join("path")
      .attr("d", ribbon)
      .attr("fill", d => COLORS_CHORD[d.source.index])
      .attr("stroke", d => d3.rgb(COLORS_CHORD[d.source.index]).darker())
      .attr("stroke-width", 0.5)
      .on("mouseover", function (event, d) {
        d3.select(this).attr("fill-opacity", 0.9)
        const src = flags[d.source.index], tgt = flags[d.target.index]
        const days = matrix[d.source.index][d.target.index]
        tooltip.style("opacity", 1)
          .style("left", (event.offsetX + 10) + "px")
          .style("top", (event.offsetY - 40) + "px")
          .html(src === tgt
            ? `<strong>${src}</strong><br>${days} days total`
            : `<strong>${src}</strong> + <strong>${tgt}</strong><br>${days} days co-occurred`)
      })
      .on("mouseout", function () {
        d3.select(this).attr("fill-opacity", 0.65)
        tooltip.style("opacity", 0)
      })

    /* arcs */
    const group = g.append("g").selectAll("g").data(chords.groups).join("g")

    group.append("path")
      .attr("d", arc)
      .attr("fill", d => COLORS_CHORD[d.index])
      .attr("stroke", d => d3.rgb(COLORS_CHORD[d.index]).darker())

    group.append("text")
      .each(d => { d.angle = (d.startAngle + d.endAngle) / 2 })
      .attr("dy", "0.35em")
      .attr("transform", d =>
        `rotate(${(d.angle * 180) / Math.PI - 90}) translate(${radius + 28}) ${d.angle > Math.PI ? "rotate(180)" : ""}`)
      .attr("text-anchor", d => d.angle > Math.PI ? "end" : null)
      .attr("fill", "#e2e8f0")
      .style("font-size", "11px")
      .text(d => flags[d.index])

    /* self-link value labels on arcs */
    group.append("text")
      .each(d => { d.angle = (d.startAngle + d.endAngle) / 2 })
      .attr("dy", "0.35em")
      .attr("transform", d =>
        `rotate(${(d.angle * 180) / Math.PI - 90}) translate(${radius + 10}) ${d.angle > Math.PI ? "rotate(180)" : ""}`)
      .attr("text-anchor", "middle")
      .attr("fill", "#0f172a")
      .style("font-size", "10px").style("font-weight", 700)
      .text(d => matrix[d.index][d.index])
  }, [daily])

  return <div ref={ref} style={{ ...svgWrapStyle, position: "relative" }} />
}

/* ═══════════════════════════════════════════════════════════════════
   Page shell
   ═══════════════════════════════════════════════════════════════════ */
export default function D3Page() {
  const { records, loading, error } = useData()

  if (loading) return <p style={{ color: "#94a3b8", padding: 32 }}>Loading data...</p>
  if (error)   return <p style={{ color: "#f87171", padding: 32 }}>Error: {error.message}</p>

  const daily = buildDaily(records)

  return (
    <div style={pageStyle}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: 4 }}>D3.js: Raw SVG Control</h1>
      <p style={descStyle}>
        Each chart below is drawn with{" "}
        <strong style={{ color: "#f8fafc" }}>pure D3</strong> inside a{" "}
        <code style={{ color: "#38bdf8" }}>useRef</code> / <code style={{ color: "#38bdf8" }}>useEffect</code> hook.
        D3 owns the SVG DOM; React owns the container. This unlocks layouts and interactions
        that are not possible with declarative wrapper libraries: free-form brush selection,
        Voronoi nearest-point search, force simulations, chord diagrams, and calendar heatmaps.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", margin: "0.75rem 0 0.5rem", fontSize: "0.82rem" }}>
        <div>
          <div style={{ color: "#34d399", fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Strengths</div>
          <ul style={{ margin: 0, paddingLeft: "1.15rem", color: "#94a3b8", lineHeight: 1.5 }}>
            <li>Unlimited chart variety: any layout achievable in SVG or Canvas is within reach</li>
            <li>First-class primitives: brush, zoom, force simulation, Delaunay/Voronoi, geo projections</li>
            <li>Largest community example library and most comprehensive axis and scale system available</li>
            <li>Full control over enter/update/exit transitions for custom animated storytelling</li>
          </ul>
        </div>
        <div>
          <div style={{ color: "#f87171", fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Limitations</div>
          <ul style={{ margin: 0, paddingLeft: "1.15rem", color: "#94a3b8", lineHeight: 1.5 }}>
            <li>Steep learning curve: no declarative defaults; every mark, scale, and axis is imperative</li>
            <li>React integration is awkward: D3 and React both want to own and mutate the same DOM nodes</li>
            <li>Simple charts require significantly more setup code than any higher-level library here</li>
            <li>No built-in responsive sizing or sensible color defaults: all manual</li>
          </ul>
        </div>
      </div>

      {/* 1 */}
      <h2 style={headingStyle}>1. Focus + Context Brush: Linked Water Level Time Series</h2>
      <p style={descStyle}>
        Two panels share the same data. The bottom "context" strip lets you drag a brush selection
        to zoom the top "focus" view in real time. D3's <code>d3.brushX()</code> modifies the focus
        x-scale and redraws paths on every <code>brush</code> event: a first-class D3 interaction
        pattern that neither Chart.js nor Recharts expose as a composable primitive.
        Hover on the focus panel for a crosshair snapping to the nearest day.
      </p>
      <BrushChart daily={daily} />

      {/* 2 */}
      <h2 style={headingStyle}>2. Voronoi Scatter: Temperature vs Salinity with Nearest-Point Hover</h2>
      <p style={descStyle}>
        Points are coloured by month. Moving the cursor anywhere in the chart area snaps to the
        geometrically nearest data point using <code>d3.Delaunay.from()</code>: a computational
        geometry structure computed once at render time. This gives large hit targets even for
        densely packed points, without invisible overlay rectangles per point. Not available as a
        native feature in Chart.js or Recharts.
      </p>
      <VoronoiScatter daily={daily} />

      {/* 3 */}
      <h2 style={headingStyle}>3. Streamgraph: Rainfall, Temperature, and Water Level Over Season</h2>
      <p style={descStyle}>
        Three signals are stacked with <code>d3.stackOffsetWiggle</code> which minimises
        deviation from a horizontal baseline to produce the flowing "stream" silhouette.
        The offset algorithm is purely mathematical: it shifts each layer up or down so
        the overall shape stays centred, making seasonal trends easier to compare than a
        standard stacked area where everything sits on y=0. Not available in Chart.js or Recharts.
      </p>
      <Streamgraph daily={daily} />

      {/* 4 */}
      <h2 style={headingStyle}>4. Calendar Heatmap: Daily Water Level as Colour Intensity</h2>
      <p style={descStyle}>
        D3's <code>d3.timeMonday.floor()</code> and <code>d3.timeMonth.range()</code> utilities
        compute exact week and month boundaries, placing each day cell in a 7-row (weekday)
        by ~14-column (week) grid. Cell colour encodes mean daily water level via{" "}
        <code>d3.scalePlasma</code>. Hover a cell to see the date, level, and rainfall. This
        layout is a pure SVG rectangle-placement exercise: impossible to achieve in a
        declarative chart library without building an identical custom chart type.
      </p>
      <CalendarHeatmap daily={daily} />

      {/* 5 */}
      <h2 style={headingStyle}>5. Force-Directed Bubble Chart: Storm Events by Month</h2>
      <p style={descStyle}>
        Every day with rainfall{" >= "}0.1 in becomes a bubble sized by{" "}
        <code>d3.scaleSqrt</code> (area proportional to rainfall). A <code>d3.forceSimulation</code>{" "}
        with <code>forceX</code> clustering by month and <code>forceCollide</code> preventing
        overlap runs 300 ticks before render, producing the final collision-free positions.
        The physics simulation produces layouts that communicate both cluster membership and
        magnitude simultaneously: something that can only be expressed via a force engine.
      </p>
      <ForceBubble daily={daily} />

      {/* 6 */}
      <h2 style={headingStyle}>6. Chord Diagram: Co-Occurrence of Extreme Conditions</h2>
      <p style={descStyle}>
        Counts how many days simultaneously had high rainfall{" ("}&#x3e;=0.5 in{"), "}
        high water temperature{" ("}&#x3e;=31 C{")"},  or elevated bottom salinity{" ("}&#x3e;=1 ppt{")"}.
        Each arc represents one condition; ribbon width is the number of co-occurring days.
        Thick self-ribbons show how often that condition occurred alone; cross-ribbons reveal
        compound stress events. <code>d3.chord()</code> + <code>d3.ribbon()</code> produce this
        layout from a 3x3 matrix in ~15 lines: no equivalent exists in Chart.js or Recharts.
      </p>
      <ChordDiagram daily={daily} />

      {/* 7 */}
      <h2 style={headingStyle}>7. Scroll / Pinch Zoom: <code>d3.zoom()</code> on Water Level</h2>
      <p style={descStyle}>
        <code>d3.zoom()</code> attaches wheel, pinch, and drag listeners that emit a{" "}
        <code>ZoomTransform</code> object. On each event the x-scale is <em>rescaled</em> via{" "}
        <code>transform.rescaleX(xOrig)</code>, then the axis and path are redrawn: the DOM
        itself is never scaled, only the coordinate mapping changes. This is fundamentally
        different from the brush above (which selects a sub-range) and from Chart.js / Recharts
        zoom plugins (which rescale the entire canvas). Try scrolling inside the chart.
      </p>
      <ZoomLine daily={daily} />

      {/* 8 */}
      <h2 style={headingStyle}>8. Histogram + KDE Curve: Water Level Frequency Distribution</h2>
      <p style={descStyle}>
        <code>d3.bin()</code> partitions the 92-day array into equal-width buckets and returns
        the count per bucket. A kernel density estimate (KDE) is computed manually with an
        Epanechnikov kernel and overlaid as a smooth <code>d3.area()</code> curve on a secondary
        y-axis. Frequency histograms with overlaid density curves require a bin generator and
        KDE math that you must implement yourself in Chart.js / Recharts; D3's scale and path
        primitives make it a natural fit.
      </p>
      <HistogramKDE daily={daily} />

      {/* 9 */}
      <h2 style={headingStyle}>9. Radial Polar Area: Diurnal Temperature Pattern (Clock Face)</h2>
      <p style={descStyle}>
        Each of the 24 hours maps to a wedge built with <code>d3.arc()</code>. The inner radius
        is fixed; the outer radius is scaled to the hourly mean temperature. Labels are placed
        with <code>rotate(angle) translate(r)</code> transforms: the same technique Chart.js
        uses internally for its Polar Area chart, but here every pixel of the ring, label
        offset, and colour interpolation is explicit. Neighbour-interpolation fills the 9am
        telemetry gap.
      </p>
      <RadialPolar daily={daily} records={records} />

      {/* 10 */}
      <h2 style={headingStyle}>10. Box Plot by Month: Water Level Statistical Spread</h2>
      <p style={descStyle}>
        <code>d3.quantile()</code> computes Q1, median, Q3, and whisker bounds per month.
        Outliers beyond 1.5 IQR are plotted as individual circles. The box, median line, and
        whisker caps are plain SVG <code>rect</code> and <code>line</code> elements positioned
        by a shared ordinal scale. Box plots exist as a concept but have no built-in
        implementation in Chart.js or Recharts: here D3's statistical utilities make the
        math trivial.
      </p>
      <BoxPlot daily={daily} />

      {/* 11 */}
      <h2 style={headingStyle}>11. Animated Pivot Bar: Switch Variables with <code>d3.transition()</code></h2>
      <p style={descStyle}>
        Click a variable button to morph the bars to a new dataset. D3's{" "}
        <code>.transition().duration(500).attr("height", ...)</code> interpolates every bar
        height simultaneously, producing a smooth visual comparison between water level,
        bottom salinity, and conductance monthly averages. The y-axis also transitions via{" "}
        <code>axisLeft.call()</code> inside the same transition chain. This kind of
        coordinated animated update is uniquely ergonomic in D3: declarative libraries
        re-render the whole component tree instead.
      </p>
      <AnimatedPivot daily={daily} />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   7. Zoom Line  (d3.zoom with rescaleX)
   ═══════════════════════════════════════════════════════════════════ */
function ZoomLine({ daily }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!daily.length) return
    const el = ref.current
    d3.select(el).selectAll("*").remove()

    const W = el.clientWidth || 900
    const H = 260
    const margin = { top: 14, right: 24, bottom: 38, left: 52 }
    const iW = W - margin.left - margin.right
    const iH = H - margin.top - margin.bottom

    const svg = d3.select(el).append("svg")
      .attr("width", "100%").attr("viewBox", `0 0 ${W} ${H}`)

    /* clip */
    svg.append("defs").append("clipPath").attr("id", "zoom-clip")
      .append("rect").attr("width", iW).attr("height", iH)

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`)

    const xOrig = d3.scaleTime()
      .domain(d3.extent(daily, d => d.dt))
      .range([0, iW])
    let xS = xOrig.copy()

    const ext = d3.extent(daily, d => d.meanLevel)
    const yS = d3.scaleLinear()
      .domain([ext[0] - 0.05, ext[1] + 0.05])
      .range([iH, 0])

    const lineFn = d3.line()
      .defined(d => d.meanLevel != null)
      .x(d => xS(d.dt))
      .y(d => yS(d.meanLevel))
      .curve(d3.curveMonotoneX)

    const areaFn = d3.area()
      .defined(d => d.meanLevel != null)
      .x(d => xS(d.dt))
      .y0(iH).y1(d => yS(d.meanLevel))
      .curve(d3.curveMonotoneX)

    /* grid */
    const gridY = g.append("g").attr("class", "grid-y")
      .call(d3.axisLeft(yS).ticks(5).tickSize(-iW).tickFormat(""))
      .call(gr => gr.select(".domain").remove())
      .call(gr => gr.selectAll(".tick line").attr("stroke", "#334155"))

    /* area + line */
    const areaPath = g.append("path")
      .datum(daily)
      .attr("fill", "rgba(14,165,233,0.15)")
      .attr("d", areaFn)
      .attr("clip-path", "url(#zoom-clip)")

    const linePath = g.append("path")
      .datum(daily)
      .attr("fill", "none").attr("stroke", "#38bdf8").attr("stroke-width", 1.5)
      .attr("d", lineFn)
      .attr("clip-path", "url(#zoom-clip)")

    /* rainfall rug marks */
    const rugG = g.append("g").attr("clip-path", "url(#zoom-clip)")
    rugG.selectAll("line")
      .data(daily.filter(d => d.maxRain > 0)).join("line")
      .attr("class", "rug")
      .attr("x1", d => xS(d.dt)).attr("x2", d => xS(d.dt))
      .attr("y1", iH - 1).attr("y2", d => iH - 1 - Math.min(30, d.maxRain * 18))
      .attr("stroke", "#6366f1").attr("stroke-width", 2).attr("opacity", 0.7)

    /* axes */
    const xAxis = g.append("g").attr("transform", `translate(0,${iH})`)
      .call(d3.axisBottom(xS).ticks(7).tickFormat(d3.timeFormat("%b %d")))
      .call(gr => gr.selectAll("text").attr("fill", "#94a3b8").style("font-size", "11px"))
      .call(gr => gr.select(".domain").attr("stroke", "#475569"))

    g.append("g").call(d3.axisLeft(yS).ticks(5))
      .call(gr => gr.selectAll("text").attr("fill", "#94a3b8").style("font-size", "11px"))
      .call(gr => gr.select(".domain").attr("stroke", "#475569"))

    g.append("text").attr("x", -iH / 2).attr("y", -40).attr("transform", "rotate(-90)")
      .attr("fill", "#64748b").style("font-size", "11px").attr("text-anchor", "middle")
      .text("Water Level (ft)")

    svg.append("text").attr("x", margin.left + 8).attr("y", margin.top + iH - 6)
      .attr("fill", "#6366f1").style("font-size", "10px").text("| = rainfall")

    /* zoom behaviour */
    const zoom = d3.zoom()
      .scaleExtent([1, 30])
      .translateExtent([[0, 0], [iW, iH]])
      .extent([[0, 0], [iW, iH]])
      .on("zoom", ({ transform }) => {
        xS = transform.rescaleX(xOrig)
        linePath.attr("d", lineFn)
        areaPath.attr("d", areaFn)
        rugG.selectAll("line.rug")
          .attr("x1", d => xS(d.dt)).attr("x2", d => xS(d.dt))
        xAxis.call(d3.axisBottom(xS).ticks(7).tickFormat(d3.timeFormat("%b %d")))
          .call(gr => gr.selectAll("text").attr("fill", "#94a3b8").style("font-size", "11px"))
          .call(gr => gr.select(".domain").attr("stroke", "#475569"))
      })

    svg.append("rect")
      .attr("x", margin.left).attr("y", margin.top)
      .attr("width", iW).attr("height", iH)
      .attr("fill", "none").attr("pointer-events", "all")
      .call(zoom)
  }, [daily])

  return <div ref={ref} style={svgWrapStyle} />
}

/* ═══════════════════════════════════════════════════════════════════
   8. Histogram + KDE  (d3.bin + Epanechnikov kernel)
   ═══════════════════════════════════════════════════════════════════ */
function HistogramKDE({ daily }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!daily.length) return
    const el = ref.current
    d3.select(el).selectAll("*").remove()

    const W = el.clientWidth || 900
    const H = 280
    const margin = { top: 14, right: 60, bottom: 38, left: 52 }
    const iW = W - margin.left - margin.right
    const iH = H - margin.top - margin.bottom

    const values = daily.map(d => d.meanLevel).filter(v => v != null).sort(d3.ascending)

    const xS = d3.scaleLinear()
      .domain([d3.min(values) - 0.02, d3.max(values) + 0.02])
      .range([0, iW])

    const bins = d3.bin().domain(xS.domain()).thresholds(20)(values)

    const yCount = d3.scaleLinear()
      .domain([0, d3.max(bins, b => b.length)])
      .range([iH, 0]).nice()

    /* KDE */
    function epanechnikov(bw) {
      return (x, xi) => {
        const u = (x - xi) / bw
        return Math.abs(u) <= 1 ? 0.75 * (1 - u * u) / bw : 0
      }
    }
    const bw = 0.04
    const kernel = epanechnikov(bw)
    const xs = d3.range(xS.domain()[0], xS.domain()[1], 0.005)
    const density = xs.map(x => [x, d3.mean(values, xi => kernel(x, xi))])
    const maxDensity = d3.max(density, d => d[1])
    const yDensity = d3.scaleLinear().domain([0, maxDensity]).range([iH, 0])

    const svg = d3.select(el).append("svg")
      .attr("width", "100%").attr("viewBox", `0 0 ${W} ${H}`)
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`)

    /* grid */
    g.append("g").call(d3.axisLeft(yCount).ticks(5).tickSize(-iW).tickFormat(""))
      .call(gr => gr.select(".domain").remove())
      .call(gr => gr.selectAll(".tick line").attr("stroke", "#334155"))

    /* bars */
    g.selectAll("rect.bin")
      .data(bins).join("rect")
      .attr("class", "bin")
      .attr("x", d => xS(d.x0) + 1)
      .attr("width", d => Math.max(0, xS(d.x1) - xS(d.x0) - 2))
      .attr("y", d => yCount(d.length))
      .attr("height", d => iH - yCount(d.length))
      .attr("fill", "#0ea5e9")
      .attr("opacity", 0.65)

    /* median & mean lines */
    const med = d3.quantile(values, 0.5)
    const mn  = d3.mean(values)
    ;[[med, "#f59e0b", "median"], [mn, "#a78bfa", "mean"]].forEach(([v, col, lbl]) => {
      g.append("line")
        .attr("x1", xS(v)).attr("x2", xS(v))
        .attr("y1", 0).attr("y2", iH)
        .attr("stroke", col).attr("stroke-width", 1.5).attr("stroke-dasharray", "5 3")
      g.append("text").attr("x", xS(v) + 3).attr("y", 12)
        .attr("fill", col).style("font-size", "10px").text(lbl)
    })

    /* KDE curve on secondary axis */
    const kdeArea = d3.area()
      .x(d => xS(d[0]))
      .y0(iH).y1(d => yDensity(d[1]))
      .curve(d3.curveBasis)
    g.append("path").datum(density)
      .attr("fill", "rgba(168,139,250,0.18)")
      .attr("stroke", "#a78bfa").attr("stroke-width", 2)
      .attr("d", kdeArea)

    /* axes */
    g.append("g").attr("transform", `translate(0,${iH})`)
      .call(d3.axisBottom(xS).ticks(8).tickFormat(v => v.toFixed(2)))
      .call(gr => gr.selectAll("text").attr("fill", "#94a3b8").style("font-size", "11px"))
      .call(gr => gr.select(".domain").attr("stroke", "#475569"))
    g.append("g").call(d3.axisLeft(yCount).ticks(5))
      .call(gr => gr.selectAll("text").attr("fill", "#94a3b8").style("font-size", "11px"))
      .call(gr => gr.select(".domain").attr("stroke", "#475569"))

    /* right y-axis for density */
    g.append("g").attr("transform", `translate(${iW},0)`)
      .call(d3.axisRight(yDensity).ticks(4).tickFormat(d3.format(".2f")))
      .call(gr => gr.selectAll("text").attr("fill", "#a78bfa").style("font-size", "10px"))
      .call(gr => gr.select(".domain").attr("stroke", "#a78bfa"))

    g.append("text").attr("x", iW / 2).attr("y", iH + 32)
      .attr("fill", "#64748b").style("font-size", "11px").attr("text-anchor", "middle")
      .text("Daily Mean Water Level (ft)")
    g.append("text").attr("x", -iH / 2).attr("y", -40).attr("transform", "rotate(-90)")
      .attr("fill", "#64748b").style("font-size", "11px").attr("text-anchor", "middle")
      .text("Count")
    g.append("text").attr("x", -iH / 2).attr("y", iW + 58).attr("transform", "rotate(-90)")
      .attr("fill", "#a78bfa").style("font-size", "11px").attr("text-anchor", "middle")
      .text("Density (KDE)")
  }, [daily])

  return <div ref={ref} style={svgWrapStyle} />
}

/* ═══════════════════════════════════════════════════════════════════
   9. Radial Polar Area  (d3.arc clock-face diurnal temperature)
   ═══════════════════════════════════════════════════════════════════ */
function RadialPolar({ records }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!records.length) return
    const el = ref.current
    d3.select(el).selectAll("*").remove()

    /* build hourly buckets with neighbour interpolation */
    const buckets = Array.from({ length: 24 }, () => [])
    for (const r of records) {
      if (r.temp_top_c == null || r.temp_top_c < 15) continue
      buckets[r.datetime.toDate().getHours()].push(r.temp_top_c)
    }
    const raw = buckets.map((b, i) => ({ hour: i, val: b.length ? d3.mean(b) : null }))
    const interp = raw.map((b, i) => {
      if (b.val != null) return b
      let prev = null, next = null
      for (let d = 1; d < 24; d++) {
        if (prev == null && raw[(i - d + 24) % 24].val != null) prev = raw[(i - d + 24) % 24].val
        if (next == null && raw[(i + d) % 24].val != null) next = raw[(i + d) % 24].val
        if (prev != null && next != null) break
      }
      return { ...b, val: prev != null && next != null ? (prev + next) / 2 : (prev ?? next) }
    })

    const vals = interp.map(d => d.val).filter(v => v != null)
    const minT = d3.min(vals), maxT = d3.max(vals)

    const W = el.clientWidth || 900, H = 380
    const cx = W / 2, cy = H / 2
    const innerR = 55, outerR = Math.min(cx, cy) - 50

    const rScale = d3.scaleLinear().domain([minT, maxT]).range([innerR, outerR])
    const color  = d3.scaleSequential(d3.interpolateYlOrRd).domain([minT, maxT])

    const sliceAngle = (2 * Math.PI) / 24
    const arc = d3.arc()
      .innerRadius(innerR)
      .outerRadius(d => rScale(d.val))
      .startAngle((_, i) => i * sliceAngle - Math.PI / 2)
      .endAngle((_, i) => (i + 1) * sliceAngle - Math.PI / 2)

    const svg = d3.select(el).append("svg")
      .attr("width", "100%").attr("viewBox", `0 0 ${W} ${H}`)
    const g = svg.append("g").attr("transform", `translate(${cx},${cy})`)

    /* concentric reference rings */
    ;[minT, (minT + maxT) / 2, maxT].forEach(t => {
      g.append("circle").attr("r", rScale(t))
        .attr("fill", "none").attr("stroke", "#334155").attr("stroke-dasharray", "3 3")
      g.append("text").attr("x", 3).attr("y", -rScale(t) - 3)
        .attr("fill", "#475569").style("font-size", "9px").text(t.toFixed(1) + " C")
    })

    /* wedges */
    const tooltip = d3.select(el).append("div")
      .style("position", "absolute").style("pointer-events", "none")
      .style("background", "#0f172a").style("border", "1px solid #334155")
      .style("border-radius", "6px").style("padding", "6px 10px")
      .style("font-size", "11px").style("color", "#e2e8f0").style("opacity", 0)

    g.selectAll("path").data(interp).join("path")
      .attr("d", arc)
      .attr("fill", d => color(d.val))
      .attr("opacity", 0.88)
      .attr("stroke", "#0f172a").attr("stroke-width", 0.5)
      .on("mouseover", function (event, d) {
        d3.select(this).attr("opacity", 1).attr("stroke-width", 1.5).attr("stroke", "#f59e0b")
        const label = `${String(d.hour).padStart(2, "0")}:00`
        tooltip.style("opacity", 1)
          .style("left", (event.offsetX + 10) + "px")
          .style("top", (event.offsetY - 36) + "px")
          .html(`<strong>${label}</strong><br>Mean Temp: ${d.val.toFixed(2)} C`)
      })
      .on("mouseout", function () {
        d3.select(this).attr("opacity", 0.88).attr("stroke-width", 0.5).attr("stroke", "#0f172a")
        tooltip.style("opacity", 0)
      })

    /* hour labels */
    ;[0, 3, 6, 9, 12, 15, 18, 21].forEach(h => {
      const angle = h * sliceAngle - Math.PI / 2
      const r = outerR + 22
      g.append("text")
        .attr("x", Math.cos(angle) * r).attr("y", Math.sin(angle) * r + 4)
        .attr("fill", "#94a3b8").style("font-size", "11px").attr("text-anchor", "middle")
        .text(`${String(h).padStart(2, "0")}:00`)
    })

    /* colour legend */
    const lgW = 140, lgH = 10
    const lgX = cx - lgW / 2, lgY = H - 22
    const defs = svg.append("defs")
    const lg = defs.append("linearGradient").attr("id", "polar-grad").attr("x1", "0%").attr("x2", "100%")
    d3.range(0, 1.01, 0.1).forEach(t => {
      lg.append("stop").attr("offset", `${t * 100}%`).attr("stop-color", color(minT + t * (maxT - minT)))
    })
    svg.append("rect").attr("x", lgX).attr("y", lgY).attr("width", lgW).attr("height", lgH)
      .attr("rx", 4).attr("fill", "url(#polar-grad)")
    svg.append("text").attr("x", lgX).attr("y", lgY + lgH + 12)
      .attr("fill", "#64748b").style("font-size", "10px").text(minT.toFixed(1) + " C")
    svg.append("text").attr("x", lgX + lgW).attr("y", lgY + lgH + 12)
      .attr("fill", "#64748b").style("font-size", "10px").attr("text-anchor", "end").text(maxT.toFixed(1) + " C")
  }, [records])

  return <div ref={ref} style={{ ...svgWrapStyle, position: "relative" }} />
}

/* ═══════════════════════════════════════════════════════════════════
   10. Box Plot by Month  (d3.quantile, whiskers, outliers)
   ═══════════════════════════════════════════════════════════════════ */
function BoxPlot({ daily }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!daily.length) return
    const el = ref.current
    d3.select(el).selectAll("*").remove()

    const months = ["July", "August", "September"]
    const monthData = months.map(m => {
      const vals = daily
        .filter(d => d.month === m && d.meanLevel != null)
        .map(d => d.meanLevel)
        .sort(d3.ascending)
      const q1  = d3.quantile(vals, 0.25)
      const med = d3.quantile(vals, 0.5)
      const q3  = d3.quantile(vals, 0.75)
      const iqr = q3 - q1
      const lo  = q1 - 1.5 * iqr
      const hi  = q3 + 1.5 * iqr
      const whiskerLo = d3.min(vals.filter(v => v >= lo))
      const whiskerHi = d3.max(vals.filter(v => v <= hi))
      const outliers  = vals.filter(v => v < lo || v > hi)
      return { month: m, q1, med, q3, whiskerLo, whiskerHi, outliers, vals }
    })

    const W = el.clientWidth || 900
    const H = 300
    const margin = { top: 20, right: 24, bottom: 38, left: 56 }
    const iW = W - margin.left - margin.right
    const iH = H - margin.top - margin.bottom

    const xS = d3.scaleBand().domain(months).range([0, iW]).padding(0.4)
    const allVals = daily.map(d => d.meanLevel).filter(v => v != null)
    const yS = d3.scaleLinear()
      .domain([d3.min(allVals) - 0.02, d3.max(allVals) + 0.02]).nice()
      .range([iH, 0])

    const svg = d3.select(el).append("svg")
      .attr("width", "100%").attr("viewBox", `0 0 ${W} ${H}`)
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`)

    /* grid */
    g.append("g").call(d3.axisLeft(yS).ticks(6).tickSize(-iW).tickFormat(""))
      .call(gr => gr.select(".domain").remove())
      .call(gr => gr.selectAll(".tick line").attr("stroke", "#334155"))

    const tooltip = d3.select(el).append("div")
      .style("position", "absolute").style("pointer-events", "none")
      .style("background", "#0f172a").style("border", "1px solid #334155")
      .style("border-radius", "6px").style("padding", "6px 10px")
      .style("font-size", "11px").style("color", "#e2e8f0").style("opacity", 0)

    monthData.forEach(d => {
      const bx = xS(d.month)
      const bw = xS.bandwidth()
      const col = MONTH_COLOR[d.month]

      /* whisker lines */
      g.append("line")
        .attr("x1", bx + bw / 2).attr("x2", bx + bw / 2)
        .attr("y1", yS(d.whiskerHi)).attr("y2", yS(d.q3))
        .attr("stroke", col).attr("stroke-width", 1.5).attr("stroke-dasharray", "4 2")
      g.append("line")
        .attr("x1", bx + bw / 2).attr("x2", bx + bw / 2)
        .attr("y1", yS(d.q1)).attr("y2", yS(d.whiskerLo))
        .attr("stroke", col).attr("stroke-width", 1.5).attr("stroke-dasharray", "4 2")

      /* whisker caps */
      ;[d.whiskerHi, d.whiskerLo].forEach(wv => {
        g.append("line")
          .attr("x1", bx + bw * 0.25).attr("x2", bx + bw * 0.75)
          .attr("y1", yS(wv)).attr("y2", yS(wv))
          .attr("stroke", col).attr("stroke-width", 1.5)
      })

      /* IQR box */
      g.append("rect")
        .attr("x", bx).attr("y", yS(d.q3))
        .attr("width", bw).attr("height", yS(d.q1) - yS(d.q3))
        .attr("fill", col).attr("opacity", 0.28)
        .attr("stroke", col).attr("stroke-width", 1.5).attr("rx", 3)
        .on("mouseover", function (event) {
          tooltip.style("opacity", 1)
            .style("left", (event.offsetX + 10) + "px")
            .style("top", (event.offsetY - 50) + "px")
            .html(`<strong>${d.month}</strong><br>
              Q3: ${d.q3.toFixed(3)} ft<br>
              Median: ${d.med.toFixed(3)} ft<br>
              Q1: ${d.q1.toFixed(3)} ft<br>
              IQR: ${(d.q3 - d.q1).toFixed(3)} ft<br>
              n = ${d.vals.length} days`)
        })
        .on("mouseout", () => tooltip.style("opacity", 0))

      /* median line */
      g.append("line")
        .attr("x1", bx).attr("x2", bx + bw)
        .attr("y1", yS(d.med)).attr("y2", yS(d.med))
        .attr("stroke", col).attr("stroke-width", 2.5)

      /* outliers */
      g.selectAll(null).data(d.outliers).join("circle")
        .attr("cx", bx + bw / 2)
        .attr("cy", v => yS(v))
        .attr("r", 3)
        .attr("fill", "none")
        .attr("stroke", col)
        .attr("stroke-width", 1.5)
        .attr("opacity", 0.8)
    })

    /* axes */
    g.append("g").attr("transform", `translate(0,${iH})`)
      .call(d3.axisBottom(xS))
      .call(gr => gr.selectAll("text").attr("fill", "#94a3b8").style("font-size", "12px"))
      .call(gr => gr.select(".domain").attr("stroke", "#475569"))
    g.append("g").call(d3.axisLeft(yS).ticks(6))
      .call(gr => gr.selectAll("text").attr("fill", "#94a3b8").style("font-size", "11px"))
      .call(gr => gr.select(".domain").attr("stroke", "#475569"))
    g.append("text").attr("x", -iH / 2).attr("y", -44).attr("transform", "rotate(-90)")
      .attr("fill", "#64748b").style("font-size", "11px").attr("text-anchor", "middle")
      .text("Water Level (ft): box = IQR, line = median, circles = outliers")
  }, [daily])

  return <div ref={ref} style={{ ...svgWrapStyle, position: "relative" }} />
}

/* ═══════════════════════════════════════════════════════════════════
   11. Animated Pivot Bar  (d3.transition for variable switching)
   ═══════════════════════════════════════════════════════════════════ */
function AnimatedPivot({ daily }) {
  const ref     = useRef(null)
  const stateRef = useRef({ variable: "meanLevel" })

  const VARS = [
    { key: "meanLevel",   label: "Water Level (ft)",        color: "#38bdf8" },
    { key: "meanSalBot",  label: "Salinity Bottom (ppt)",   color: "#f97316" },
    { key: "meanCondTop", label: "Conductance Top (uS/cm)", color: "#a855f7" },
  ]

  useEffect(() => {
    if (!daily.length) return
    const el = ref.current
    d3.select(el).selectAll("*").remove()

    const W = el.clientWidth || 900
    const H = 280
    const margin = { top: 14, right: 24, bottom: 40, left: 58 }
    const iW = W - margin.left - margin.right
    const iH = H - margin.top - margin.bottom

    const months = ["July", "August", "September"]
    const xS = d3.scaleBand().domain(months).range([0, iW]).padding(0.35)

    function getMeans(varKey) {
      return months.map(m => {
        const vals = daily.filter(d => d.month === m && d[varKey] != null).map(d => d[varKey])
        return { month: m, value: vals.length ? d3.mean(vals) : 0 }
      })
    }

    const svg = d3.select(el).append("svg")
      .attr("width", "100%").attr("viewBox", `0 0 ${W} ${H}`)
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`)

    /* axes shells */
    g.append("g").attr("transform", `translate(0,${iH})`)
      .attr("class", "x-axis")
      .call(d3.axisBottom(xS))
      .call(gr => gr.selectAll("text").attr("fill", "#94a3b8").style("font-size", "12px"))
      .call(gr => gr.select(".domain").attr("stroke", "#475569"))

    const yAxisG = g.append("g").attr("class", "y-axis")
    const yLabel = g.append("text")
      .attr("x", -iH / 2).attr("y", -46).attr("transform", "rotate(-90)")
      .attr("fill", "#64748b").style("font-size", "11px").attr("text-anchor", "middle")

    /* value labels above bars */
    const labelG = g.append("g").attr("class", "bar-labels")

    /* bars */
    const barsG = g.append("g")

    function update(varKey, animate) {
      const varMeta = VARS.find(v => v.key === varKey)
      const data = getMeans(varKey)
      const yS = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.value) * 1.12]).nice()
        .range([iH, 0])

      const t = animate
        ? d3.transition().duration(520).ease(d3.easeCubicInOut)
        : d3.transition().duration(0)

      /* y-axis transition */
      yAxisG.transition(t).call(d3.axisLeft(yS).ticks(5))
        .call(gr => gr.selectAll("text").attr("fill", "#94a3b8").style("font-size", "11px"))
        .call(gr => gr.select(".domain").attr("stroke", "#475569"))
        .call(gr => gr.selectAll(".tick line").attr("stroke", "#475569"))

      yLabel.text(varMeta.label)

      /* bars */
      barsG.selectAll("rect").data(data, d => d.month)
        .join(
          enter => enter.append("rect")
            .attr("x", d => xS(d.month))
            .attr("width", xS.bandwidth())
            .attr("y", iH).attr("height", 0)
            .attr("fill", varMeta.color).attr("opacity", 0.78).attr("rx", 4),
          update => update
        )
        .transition(t)
        .attr("x", d => xS(d.month))
        .attr("width", xS.bandwidth())
        .attr("y", d => yS(d.value))
        .attr("height", d => iH - yS(d.value))
        .attr("fill", varMeta.color)

      /* value labels */
      labelG.selectAll("text").data(data, d => d.month)
        .join(
          enter => enter.append("text")
            .attr("x", d => xS(d.month) + xS.bandwidth() / 2)
            .attr("y", iH - 4)
            .attr("fill", varMeta.color).style("font-size", "12px")
            .attr("text-anchor", "middle").attr("font-weight", 700),
          update => update
        )
        .transition(t)
        .attr("x", d => xS(d.month) + xS.bandwidth() / 2)
        .attr("y", d => yS(d.value) - 6)
        .attr("fill", varMeta.color)
        .textTween(function (d) {
          const prev = +this.textContent.replace(/[^\d.]/g, "") || 0
          const i = d3.interpolateNumber(prev, d.value)
          const fmt = d.value > 100 ? d3.format(".0f") : d3.format(".3f")
          return t => fmt(i(t))
        })
    }

    update(stateRef.current.variable, false)

    /* buttons rendered as SVG foreignObject */
    const btnY = margin.top + iH + 36
    const fo = svg.append("foreignObject")
      .attr("x", margin.left).attr("y", btnY)
      .attr("width", iW).attr("height", 38)

    const div = fo.append("xhtml:div")
      .style("display", "flex").style("gap", "12px").style("justify-content", "center")

    VARS.forEach(v => {
      div.append("xhtml:button")
        .style("background", v.key === stateRef.current.variable ? v.color : "#1e293b")
        .style("color", v.key === stateRef.current.variable ? "#0f172a" : v.color)
        .style("border", `1.5px solid ${v.color}`)
        .style("border-radius", "6px").style("padding", "4px 12px")
        .style("font-size", "11px").style("cursor", "pointer").style("font-weight", 600)
        .text(v.label.split(" (")[0])
        .on("click", function () {
          stateRef.current.variable = v.key
          update(v.key, true)
          div.selectAll("button")
            .style("background", (_, i) => VARS[i].key === v.key ? VARS[i].color : "#1e293b")
            .style("color", (_, i) => VARS[i].key === v.key ? "#0f172a" : VARS[i].color)
        })
    })
  }, [daily])

  return <div ref={ref} style={svgWrapStyle} />
}
