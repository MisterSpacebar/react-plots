import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { DataProvider } from './DataContext'
import Home from './pages/Home'
import ChartJSPage from './pages/ChartJSPage'
import RechartsPage from './pages/RechartsPage'
import D3Page from './pages/D3Page'
const PlotlyPage         = lazy(() => import('./pages/PlotlyPage'))
const GoogleChartsPage   = lazy(() => import('./pages/GoogleChartsPage'))
const EChartsPage        = lazy(() => import('./pages/EChartsPage'))
const ObservablePlotPage = lazy(() => import('./pages/ObservablePlotPage'))
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <DataProvider>
        <nav className="site-nav">
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/chartjs">Chart.js</NavLink>
          <NavLink to="/recharts">Recharts</NavLink>
          <NavLink to="/d3">D3.js</NavLink>
          <NavLink to="/plotly">Plotly.js</NavLink>
          <NavLink to="/googlecharts">Google Charts</NavLink>
          <NavLink to="/echarts">ECharts</NavLink>
          <NavLink to="/observableplot">Observable Plot</NavLink>
        </nav>
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/chartjs" element={<ChartJSPage />} />
            <Route path="/recharts" element={<RechartsPage />} />
            <Route path="/d3" element={<D3Page />} />
            <Route path="/plotly" element={
              <Suspense fallback={<p style={{ color: "#94a3b8", padding: 32 }}>Loading Plotly...</p>}>
                <PlotlyPage />
              </Suspense>
            } />
            <Route path="/googlecharts" element={
              <Suspense fallback={<p style={{ color: "#94a3b8", padding: 32 }}>Loading Google Charts...</p>}>
                <GoogleChartsPage />
              </Suspense>
            } />
            <Route path="/echarts" element={
              <Suspense fallback={<p style={{ color: "#94a3b8", padding: 32 }}>Loading ECharts...</p>}>
                <EChartsPage />
              </Suspense>
            } />
            <Route path="/observableplot" element={
              <Suspense fallback={<p style={{ color: "#94a3b8", padding: 32 }}>Loading Observable Plot...</p>}>
                <ObservablePlotPage />
              </Suspense>
            } />
          </Routes>
        </main>
      </DataProvider>
    </BrowserRouter>
  )
}

export default App
