# Clear List Feature — Vulnerabilities Table

## Overview

Implements the **Clear List** button on the SAM (Security Assessment Management) Vulnerabilities table. When clicked, it clears all currently displayed scanned vulnerabilities from the SAM view. The data is **not deleted** from the database — all historical scan results remain accessible on the **History** page.

After clearing, if the user refreshes the page and scans again, only results from scans performed **after** the clear action will appear in the table.

---

## Files Changed

### 1. `src/components/sam/VulnerabilitiesTable.jsx`

- Added `onClear` prop to the component.
- Wired the existing "🗑 Clear List" button to call `onClear`.
- Added a `window.confirm()` prompt before clearing:
  > "Are you sure you want to clear the list?  
  > Don't worry — all scanned results are still saved and can be viewed on the History page."

### 2. `src/hooks/useSAM.js` — `useVulnerabilities` hook

- **New function: `clearVulnerabilities(targetBssid)`**
  - Saves the current timestamp to `localStorage` under the key `sam_cleared_<BSSID>`.
  - Immediately sets the `vulnerabilities` state to an empty array, clearing the UI.
- **Updated `loadVulnerabilities(targetBssid)`**
  - On load, reads the `sam_cleared_<BSSID>` key from `localStorage`.
  - After mapping rows from the backend response, filters out any vulnerability whose `detectedTime` is **on or before** the stored cleared timestamp.
  - Only vulnerabilities from scans performed **after** the clear action are shown.
- Exported `clearVulnerabilities` from the hook's return object.

### 3. `src/pages/SAM/SAM.jsx`

- Destructured `clearVulnerabilities` from the `useVulnerabilities` hook.
- Passed an `onClear` handler to `VulnerabilitiesTable` that calls `clearVulnerabilities` with the current or last scanned network's BSSID.

### 4. `backend/controllers/metadataController.js`

- No permanent backend changes required. The filtering is handled entirely on the client side using `localStorage` timestamps.

---

## How It Works

```
User clicks "Clear List"
        │
        ▼
Confirmation dialog shown
        │
        ▼  (User confirms)
clearVulnerabilities(bssid) called
        │
        ├── localStorage.setItem("sam_cleared_<BSSID>", <current ISO timestamp>)
        └── setVulnerabilities([])  →  table clears immediately
        
        
User refreshes page → selects network → scans
        │
        ▼
loadVulnerabilities(bssid) called
        │
        ├── Fetches ALL vulnerabilities for the BSSID from backend
        ├── Reads cleared timestamp from localStorage
        └── Filters out rows where detectedTime <= cleared timestamp
                │
                ▼
        Only post-clear scan results are displayed
```

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| **Client-side filtering via `localStorage`** | Avoids schema changes to the database. Supabase `.gt()` on joined table columns (`scans.scan_start`) is unreliable, so filtering is done after data is fetched. |
| **No database deletion** | All scan data is preserved for the History page. The clear action only affects the SAM view. |
| **Per-BSSID clear timestamps** | Each network's clear state is tracked independently, so clearing one network's results doesn't affect another. |
| **Confirmation dialog** | Prevents accidental clears and reassures users that data is still available in History. |
