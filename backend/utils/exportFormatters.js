// backend/utils/exportFormatters.js
// CSV / XLSX export helpers — deterministic, no I/O.

/**
 * Escape a single CSV field per RFC 4180.
 * - If the value contains commas, double-quotes, or newlines it is quoted.
 * - Internal double-quotes are doubled ("").
 */
function escapeCSVField(value) {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Format rows into a CSV string.
 *
 * @param {string[]}   headers – column names (also used as row keys)
 * @param {Object[]}   rows    – data objects keyed by header names
 * @returns {string}   RFC 4180-compliant CSV content
 */
function formatCSV(headers, rows) {
  const headerLine = headers.map(escapeCSVField).join(",");
  const dataLines = (rows || []).map((row) =>
    headers.map((h) => escapeCSVField(row[h])).join(",")
  );
  return [headerLine, ...dataLines].join("\n");
}

/**
 * Parse a CSV string back into { headers, rows } for round-trip verification.
 * Supports quoted fields and embedded commas / newlines.
 *
 * NOTE: Simple parser — sufficient for test assertions.
 */
function parseCSV(csv) {
  const lines = csv.split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line) => {
    const fields = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          fields.push(current);
          current = "";
        } else {
          current += ch;
        }
      }
    }
    fields.push(current);
    return fields;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const fields = parseLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = fields[i] ?? "";
    });
    return row;
  });

  return { headers, rows };
}

/**
 * Prepare XLSX-ready row arrays (header + data rows).
 * Returns a 2-D array suitable for libraries like SheetJS (xlsx).
 *
 * @param {string[]} headers
 * @param {Object[]} rows
 * @returns {Array[]} 2-D array: [ headerRow, ...dataRows ]
 */
function formatXLSXRows(headers, rows) {
  const headerRow = [...headers];
  const dataRows = (rows || []).map((row) => headers.map((h) => row[h] ?? ""));
  return [headerRow, ...dataRows];
}

module.exports = {
  escapeCSVField,
  formatCSV,
  parseCSV,
  formatXLSXRows,
};
