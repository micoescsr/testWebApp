// utils/exportReport.js
// Opens a generated HTML report in a new browser tab and triggers print (Save as PDF).

/**
 * @param {string} htmlString - Complete self-contained HTML document string
 */
export function exportReport(htmlString) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Pop-up blocked. Please allow pop-ups for this site to export reports.");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(htmlString);
  printWindow.document.close();

  // Wait for Plotly charts to render before printing
  // Plotly needs a moment after the DOM is written to draw the charts.
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 1500); // 1.5s gives Plotly time to fetch CDN + render
  };
}
