// components/dashboard/HistoricalTrendsSection.jsx
//
// Historical Detection Trends — vulnerability findings and threat events over
// time, from the existing /history/vulnerabilities and /history/threats
// endpoints (per-scan records; no fabricated data). The two series render in
// separate chart cards so vulnerability and threat history are never combined
// under one ambiguous total.
import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { getVulnHistory, getThreatHistory } from "../../api/samHistoryApi";
import { KIND_COLORS } from "../../utils/riskColors";

const RANGES = [
  { id: "7d", label: "Last 7 Days", days: 7 },
  { id: "30d", label: "Last 30 Days", days: 30 },
  { id: "all", label: "All Time", days: null },
];

/** Aggregate scan rows ({datetime, summary}) into per-day totals inside range. */
function aggregateByDay(rows, days) {
  const cutoff =
    days != null ? Date.now() - days * 24 * 60 * 60 * 1000 : null;
  const byDay = new Map();
  (rows || []).forEach((r) => {
    if (!r.datetime) return;
    const t = new Date(r.datetime).getTime();
    if (Number.isNaN(t)) return;
    if (cutoff != null && t < cutoff) return;
    const day = new Date(t).toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) || 0) + (r.summary || 0));
  });
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, count]) => ({
      date: new Date(`${day}T00:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      count,
    }));
}

const HistoryChart = ({ title, subtitle, data, color, seriesName, emptyMessage, loading, error }) => (
  <div className="panel">
    <div className="panel-header">
      <div>
        <h3>{title}</h3>
        <span className="panel-subtitle">{subtitle}</span>
      </div>
    </div>
    <div className="panel-body history-chart-body">
      {loading ? (
        <p className="panel-empty">Loading historical data…</p>
      ) : error ? (
        <p className="panel-empty">{error}</p>
      ) : data.length > 0 ? (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} width={32} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value) => [value, seriesName]} />
            <Area
              type="monotone"
              dataKey="count"
              name={seriesName}
              stroke={color}
              strokeWidth={2}
              fill={color}
              fillOpacity={0.15}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <p className="panel-empty">
          {emptyMessage ||
            "No historical detection data is available for the selected period."}
        </p>
      )}
    </div>
  </div>
);

const HistoricalTrendsSection = () => {
  const [rangeId, setRangeId] = useState("30d");
  const [vulnRows, setVulnRows] = useState([]);
  const [threatRows, setThreatRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [vulnRes, threatRes] = await Promise.all([
          getVulnHistory(),
          getThreatHistory(),
        ]);
        if (cancelled) return;
        setVulnRows(Array.isArray(vulnRes.data) ? vulnRes.data : []);
        setThreatRows(Array.isArray(threatRes.data) ? threatRes.data : []);
        setError(null);
      } catch {
        if (!cancelled) setError("Failed to load historical detection data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const days = RANGES.find((r) => r.id === rangeId)?.days ?? null;
  const vulnSeries = useMemo(() => aggregateByDay(vulnRows, days), [vulnRows, days]);
  const threatSeries = useMemo(() => aggregateByDay(threatRows, days), [threatRows, days]);

  return (
    <section aria-labelledby="dash-history-heading" className="dash-section">
      <div className="dash-section-header">
        <h2 id="dash-history-heading" className="dash-section-title">
          Historical Detection Trends
        </h2>
        <label className="history-range-control">
          <span className="history-range-label">Period</span>
          <select
            className="small-select"
            value={rangeId}
            onChange={(e) => setRangeId(e.target.value)}
            aria-label="Historical period"
          >
            {RANGES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="dash-history-row">
        <HistoryChart
          title="Vulnerability History"
          subtitle="Vulnerability findings identified per day"
          data={vulnSeries}
          color={KIND_COLORS.vulnerability}
          seriesName="Vulnerability findings"
          emptyMessage="No vulnerability history is available for the selected period."
          loading={loading}
          error={error}
        />
        <HistoryChart
          title="Threat Findings History"
          subtitle="Threat findings recorded per day"
          data={threatSeries}
          color={KIND_COLORS.threat}
          seriesName="Threat findings"
          emptyMessage="No threat history is available for the selected period."
          loading={loading}
          error={error}
        />
      </div>
    </section>
  );
};

export default HistoricalTrendsSection;
