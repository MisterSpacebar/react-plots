import { NavLink } from 'react-router-dom'

const libraries = [
  {
    path: '/chartjs',
    name: 'Chart.js',
    summary:
      'Canvas-based charting with a clean declarative API for classic types: line, bar, radar, doughnut, bubble, and scatter. Renders 8,832 raw data points without lag using the 2-D Canvas API. Zoom and pan come from a plugin; react-chartjs-2 exposes the chart instance programmatically via a React ref.',
    pros: [
      'Fast canvas rendering: no SVG DOM to thrash at large point counts',
      'Unified data + options API works identically across all 8 built-in chart types',
      'Plugin system adds zoom/pan, annotation pins, and trendlines with one register() call',
    ],
    cons: [
      'No per-element CSS: point-level styling requires canvas workarounds or plugins',
      'Exotic layouts (chord, force, treemap) need full custom Canvas2D math',
      'No SVG output; charts cannot be vector-exported or made DOM-accessible',
    ],
  },
  {
    path: '/recharts',
    name: 'Recharts',
    summary:
      'Every visual element (axis, line, tooltip, brush) is a composable React component backed by SVG. The syncId prop links separate chart panels so hovering one snaps the tooltip cursor to the same date in all others. Brush adds a drag-select time window to any chart in a single prop.',
    pros: [
      'True React component model: all chart primitives are composable JSX elements',
      'syncId synchronizes tooltips and zoom cursor across separate chart instances',
      'SVG output is accessible, printable, and inspectable in DevTools',
    ],
    cons: [
      'SVG DOM is slower than canvas for very large point counts (thousands of rendered elements)',
      'No 3-D, Sankey, parallel coordinates, or exotic specialized chart types',
      'Animations are less polished and configurable than ECharts or Plotly',
    ],
  },
  {
    path: '/d3',
    name: 'D3.js',
    summary:
      'Not a chart library but a low-level toolbox (scales, axes, path generators, and layouts) giving you direct control over the SVG DOM. Uniquely capable of Voronoi nearest-point hover, streamgraphs, force simulations, chord diagrams, and geographic projections that no wrapper library here can replicate.',
    pros: [
      'Unlimited chart variety: any layout expressible in SVG or Canvas is achievable',
      'First-class primitives: brush, zoom, force simulation, Delaunay/Voronoi, geo projections',
      'Largest community example library of any data visualization tool',
    ],
    cons: [
      'Steep learning curve: no declarative defaults; everything is imperative and explicit',
      'React integration is awkward: D3 and React both want to own and mutate the same DOM nodes',
      'Simple charts require far more setup code than any higher-level library here',
    ],
  },
  {
    path: '/plotly',
    name: 'Plotly.js',
    summary:
      'Ships a full interactive toolbar (zoom, pan, lasso select, download PNG) on every chart with zero configuration. The only library here with true 3-D WebGL scatter. Statistical chart types (violin, density contour, parallel coordinates), waterfall, Sankey, and Indicator gauges are all first-class trace types.',
    pros: [
      'Full interaction toolbar on every chart for free: no plugin registration required',
      'Only library here with true 3-D WebGL rendering via the scatter3d trace type',
      'Statistical and flow charts built-in: violin, contour, parallel coords, Sankey, waterfall',
    ],
    cons: [
      'Very large bundle (~4.6 MB minified): must be lazy-loaded to avoid blocking startup',
      "Imperative Plotly.newPlot() API integrates awkwardly with React's render cycle",
      'Styling is less flexible than D3 for highly custom or tightly branded layouts',
    ],
  },
  {
    path: '/googlecharts',
    name: 'Google Charts',
    summary:
      "Loaded at runtime from Google's CDN: zero bundle cost. Provides chart types absent from every other library here: Timeline swim lanes, Candlestick OHLC, interactive Gauge dials, Histogram distributions, and a sortable DataTable. Annotation role columns in the DataTable make narrative labeling a first-class feature.",
    pros: [
      'Zero bundle cost: the full library downloads from gstatic.com only when the route is visited',
      'Unique chart types: Timeline, Candlestick, Gauge, Histogram, and sortable HTML Table',
      'Annotation and tooltip role columns built directly into the DataTable row format',
    ],
    cons: [
      'Requires a live internet connection: charts fail entirely when offline',
      'Runtime JSAPI load adds a network round-trip latency before any chart appears',
      "Dark theming requires injected CSS overrides; Google's own styles take load-order precedence",
    ],
  },
  {
    path: '/echarts',
    name: 'Apache ECharts',
    summary:
      'A retained-mode canvas engine (ZRender) that keeps every element addressable for hover and animation even at 8,832 points. Its coordinate system model is unique: Cartesian, polar, calendar, and parallel axes can coexist in a single option object. Built-in dataZoom with LTTB downsampling lets users scrub the full raw dataset without pre-aggregation.',
    pros: [
      'Retained-mode canvas: hover, animation, and brush work at large point counts without thinning data',
      'Multiple coordinate systems coexist in one chart (Cartesian, polar, calendar, parallel)',
      'Rich exotic types: sunburst, themeRiver, polar bar, boxplot with outlier scatter, visualMap',
    ],
    cons: [
      'Very large bundle (~1.15 MB gzip): must be lazy-loaded',
      'Deeply nested JSON option API: discoverability requires frequent documentation lookups',
      'echarts-for-react is a thin wrapper with limited React-idiomatic utilities and hooks',
    ],
  },
  {
    path: '/observableplot',
    name: 'Observable Plot',
    summary:
      'Built by the D3 team as a higher-level marks + transforms library. Every visual element (dot, line, bar, area, text, waffle) is a mark composed with inline transforms (windowY, binX, hexbin, normalizeY) that reshape data before rendering. Plot.plot() returns a native SVG element from a plain function call with no component wrapper needed.',
    pros: [
      'Built-in windowY, binX, hexbin transforms applied inline on any mark with no precomputation code',
      'tip: true on any mark adds rich formatted hover tooltips in one property',
      'fx / fy channels facet any chart into small multiples in a single channel declaration',
      'waffleY is a unique countable-unit mark type not available in any other library here',
    ],
    cons: [
      'No built-in animation or transition system',
      'No 3-D, geographic, or hierarchical chart types (treemap, sunburst)',
      'Smaller community than D3 or Chart.js; fewer tutorials and examples',
      'API evolves across 0.x minor versions with occasional breaking changes',
    ],
  },
]

export default function Home() {
  return (
    <div className="home">
      <h1>Canal NE 135: Data Visualizations</h1>
      <p>
        15-minute interval water quality readings from USGS site 2286328 (Miami-Dade County)
        combined with daily rainfall data from Miami International Airport.
        July – September 2025.
      </p>
      <ul className="library-list">
        {libraries.map((lib) => (
          <li key={lib.path} className="lib-card">
            <NavLink to={lib.path} className="lib-name">{lib.name}</NavLink>
            <p className="lib-summary">{lib.summary}</p>
            <div className="lib-meta">
              <div>
                <div className="lib-meta-label strengths">Strengths</div>
                <ul className="lib-meta-list">
                  {lib.pros.map((p) => <li key={p}>{p}</li>)}
                </ul>
              </div>
              <div>
                <div className="lib-meta-label limitations">Limitations</div>
                <ul className="lib-meta-list">
                  {lib.cons.map((c) => <li key={c}>{c}</li>)}
                </ul>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
