// utils/exportReport.js
// Opens a generated HTML report in a new browser tab and triggers print (Save as PDF).

/**
 * Open the report HTML in a new tab and trigger the print dialog.
 *
 * The report is opened via a `blob:` URL rather than `window.open("")` +
 * `document.write()`. An `about:blank` document created by `window.open`
 * inherits the opener page's Content-Security-Policy. In production/preview the
 * CSP is strict (`style-src 'self'`, `script-src 'self'`), so the report's
 * inline `<style>` block and inline/CDN `<script>` tags were blocked — Chrome
 * fell back to default styling (Times New Roman, no layout, no charts).
 *
 * A `blob:` document loads with no CSP of its own, so the self-contained HTML
 * (inline CSS + Plotly) renders correctly.
 *
 * @param {string} htmlString - Complete self-contained HTML document string
 */
export function exportReport(htmlString) {
  const blob = new Blob([htmlString], { type: "text/html" });
  const url = URL.createObjectURL(blob);

  const printWindow = window.open(url, "_blank");
  if (!printWindow) {
    URL.revokeObjectURL(url);
    alert("Pop-up blocked. Please allow pop-ups for this site to export reports.");
    return;
  }

  // Wait for Plotly charts to render before printing.
  // Plotly needs a moment after load to fetch the CDN + draw the charts.
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      // Release the blob once the print dialog has been triggered.
      URL.revokeObjectURL(url);
    }, 1500); // 1.5s gives Plotly time to fetch CDN + render
  };
}
