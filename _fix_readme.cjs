const fs = require('fs');
const path = 'c:/Users/Phaula/Documents/GitHub/testWebApp/AUDIT_README.md';

const c = fs.readFileSync(path);
const start = c.indexOf('## Frontend Implementation');
const end = c.indexOf('## Audit Event Catalog');

if (start === -1 || end === -1) {
  console.error('Could not find section boundaries');
  process.exit(1);
}

const newSection = [
  '## Frontend Implementation',
  '',
  '### File Map',
  '',
  '| File | Purpose |',
  '|------|---------|',
  '| `src/api/auditApi.js` | API client \u2014 `getAuditLogs()` + `exportAuditLogs()` (blob download) |',
  '| `src/hooks/useAuditLogs.js` | React hook \u2014 pagination, debounced search, status filter, date range, CSV export handler |',
  '| `src/components/accounts/AuditLogsTable.jsx` | Table component with expandable detail rows + Export CSV button |',
  '| `src/pages/AccountsAudit/AccountsAudit.jsx` | Page with Accounts + Audit Logs tabs, date range pickers |',
  '',
  '### Features',
  '',
  '- **Pagination** \u2014 25 rows/page, server-side',
  '- **Search** \u2014 free-text, 300ms debounce, searches event_name + entity_type',
  '- **Status filter** \u2014 SUCCESS / FAILED / all',
  '- **Date range filter** \u2014 From/To date pickers filter displayed logs and scope CSV export',
  '- **CSV Export** \u2014 superadmin-only button with confirmation dialog, 5-second rate limit, blob download (see [CSV Export](#csv-export))',
  '- **Expandable rows** \u2014 click to see old\u2192new value diff, IP, entity details',
  '- **Module badges** \u2014 AUTH, ACCOUNTS, SCANS, DETECTION, DEVICE, PORTAL, SYSTEM',
  '- **Actor display** \u2014 shows username > full name > email > \u201cSystem\u201d',
  '- **Role guard** \u2014 non-superadmin users are redirected to `/dashboard`',
  '- **Dot-notation support** \u2014 `formatEventName()` and `getEventModule()` handle both `AUTH.LOGIN` and legacy `LOGIN_SUCCESS`',
  '',
  '---',
  '',
  '',
].join('\n');

const result = Buffer.concat([
  c.slice(0, start),
  Buffer.from(newSection, 'utf-8'),
  c.slice(end),
]);

fs.writeFileSync(path, result);
console.log('OK - replaced Frontend Implementation section');
