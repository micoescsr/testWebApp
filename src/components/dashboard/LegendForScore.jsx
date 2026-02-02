// components/dashboard/LegendForScore.jsx
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
        <tr>
          <td>
            <span className="indicator-dot green"></span>
          </td>
          <td>None</td>
          <td>0%</td>
        </tr>
        <tr>
          <td>
            <span className="indicator-dot yellow"></span>
          </td>
          <td>Low</td>
          <td>1 - 39%</td>
        </tr>
        <tr>
          <td>
            <span className="indicator-dot orange"></span>
          </td>
          <td>Medium</td>
          <td>40 - 69%</td>
        </tr>
        <tr>
          <td>
            <span className="indicator-dot red"></span>
          </td>
          <td>High</td>
          <td>70 - 89%</td>
        </tr>
        <tr>
          <td>
            <span className="indicator-dot dark-red"></span>
          </td>
          <td>Critical</td>
          <td>90 - 100%</td>
        </tr>
      </tbody>
    </table>
  </div>
);

export default LegendForScore;
