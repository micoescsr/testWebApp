// components/dashboard/LegendForScore.jsx
// Driven by the centralized risk thresholds + token colors so the legend can
// never drift from the gauge/severity scale (single source of truth).
import { RISK_THRESHOLDS, severityColor } from "../../utils/riskColors";

const formatRange = (t) =>
  t.min === t.max ? `${t.min}%` : `${t.min} - ${t.max}%`;

const LegendForScore = () => (
  <div className="legend-for-score">
    <h3>Legend for Score</h3>
    <table className="legend-table">
      <thead>
        <tr>
          <th>Indicator</th>
          <th>Risk</th>
          <th>Score Range</th>
        </tr>
      </thead>
      <tbody>
        {RISK_THRESHOLDS.map((t) => (
          <tr key={t.key}>
            <td>
              <span
                className="indicator-dot"
                style={{ backgroundColor: severityColor(t.key) }}
              />
            </td>
            <td>{t.label}</td>
            <td>{formatRange(t)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default LegendForScore;
