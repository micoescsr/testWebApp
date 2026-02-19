// Lightweight mock data for threats (parent/session model)
// Import these in the UI during development without touching polling logic.

export const mappedThreats = [
  {
    id: "WFVT-006",
    name: "Evil Twin",
    severity: "CRITICAL",
    score: 9,
    status: "DETECTED",
    occurrences: 2,
    activeCount: 1,
    detectedTime: 1771161267, // epoch seconds (example)
    sessions: [
      {
        firstSeen: 1771161250,
        lastSeen: 1771161267,
        durationSeconds: 17,
        state: "DETECTED",
        raw: {
          count: 1,
        },
      },
      {
        firstSeen: 1771150000,
        lastSeen: 1771150015,
        durationSeconds: 15,
        state: "CLEARED",
        raw: { count: 3 },
      },
    ],
    raw: [
      {
        bssid: "2c:55:d3:11:69:55",
        status: "FOUND",
        findings: {
          evil_twin: {
            id: "WFVT-006",
            status: "DETECTED",
            value: "suspected evil twin",
            details: {
              first_seen_epoch: 1771161250.8434196,
              last_seen_epoch: 1771161267.2273822,
              duration_sec: 16.4,
            },
          },
        },
        detection_cycle_start: "2026-02-15 13:14:27.179",
        detection_cycle_end: "2026-02-15 13:14:27.227",
      },
    ],
  },

  {
    id: "WFVT-010",
    name: "Deauthentication Flood",
    severity: "HIGH",
    score: 7.5,
    status: "CLEARED",
    occurrences: 3,
    activeCount: 0,
    detectedTime: 1771100000,
    sessions: [
      { firstSeen: 1771100000, lastSeen: 1771100060, durationSeconds: 60, state: "CLEARED", raw: { count: 12 } },
      { firstSeen: 1771095000, lastSeen: 1771095060, durationSeconds: 60, state: "CLEARED", raw: { count: 5 } },
      { firstSeen: 1771089000, lastSeen: 1771089060, durationSeconds: 60, state: "CLEARED", raw: { count: 2 } },
    ],
    raw: [],
  },
];

// Raw poll samples (FastAPI-like) for reference/testing in dev
export const rawPollSamples = [
  [
    {
      bssid: "2c:55:d3:11:69:55",
      status: "FOUND",
      findings: {
        evil_twin: {
          id: "WFVT-006",
          status: "DETECTED",
          value: "suspected evil twin",
          details: {
            first_seen_epoch: 1771161250.8434196,
            last_seen_epoch: 1771161267.2273822,
            duration_sec: 16.4,
          },
        },
      },
      detection_cycle_start: "2026-02-15 13:14:27.179",
      detection_cycle_end: "2026-02-15 13:14:27.227",
    },
  ],
];

export default { mappedThreats, rawPollSamples };
