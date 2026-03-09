// __tests__/unit/threatMerge.test.js
//
// Tests for the mergeThreats logic that accumulates sessions across polls
// instead of replacing displayThreats wholesale.

describe("mergeThreats (frontend session accumulation)", () => {
  // Re-implement the mergeThreats function from useSAM.js for unit testing
  function mergeThreats(prev, incoming) {
    if (!incoming || incoming.length === 0) return prev;
    if (!prev || prev.length === 0) return incoming;

    const merged = new Map();
    for (const t of prev)
      merged.set(t.id, { ...t, sessions: [...(t.sessions || [])] });

    for (const t of incoming) {
      if (!merged.has(t.id)) {
        merged.set(t.id, { ...t });
      } else {
        const existing = merged.get(t.id);
        existing.status = t.status;
        existing.score = t.score ?? existing.score;
        existing.severity = t.severity ?? existing.severity;
        existing.detectedTime = t.detectedTime ?? existing.detectedTime;
        existing.activeCount = t.activeCount;
        existing.activeSession = t.activeSession;
        existing.raw = t.raw;

        const existingFirstSeens = new Set(
          (existing.sessions || []).map((s) => s.firstSeen),
        );
        for (const s of t.sessions || []) {
          if (!existingFirstSeens.has(s.firstSeen)) {
            existing.sessions.push(s);
          } else {
            const idx = existing.sessions.findIndex(
              (es) => es.firstSeen === s.firstSeen,
            );
            if (idx !== -1) {
              existing.sessions[idx] = s;
            }
          }
        }
        existing.sessions.sort((a, b) => {
          const aKey = a.lastSeen || a.firstSeen;
          const bKey = b.lastSeen || b.firstSeen;
          return bKey - aKey;
        });
        existing.occurrences = existing.sessions.filter(
          (s) => s.state === "CLEARED",
        ).length;
      }
    }
    return Array.from(merged.values());
  }

  test("returns incoming when prev is empty", () => {
    const incoming = [
      {
        id: "WFVT-006",
        status: "DETECTED",
        sessions: [{ firstSeen: 100, state: "DETECTED" }],
      },
    ];
    expect(mergeThreats([], incoming)).toEqual(incoming);
  });

  test("returns prev when incoming is empty", () => {
    const prev = [
      {
        id: "WFVT-006",
        status: "DETECTED",
        sessions: [{ firstSeen: 100, state: "DETECTED" }],
      },
    ];
    expect(mergeThreats(prev, [])).toEqual(prev);
  });

  test("appends new threat id not in prev", () => {
    const prev = [
      {
        id: "WFVT-006",
        status: "DETECTED",
        sessions: [{ firstSeen: 100, state: "DETECTED" }],
      },
    ];
    const incoming = [
      {
        id: "WFVT-007",
        status: "DETECTED",
        sessions: [{ firstSeen: 200, state: "DETECTED" }],
      },
    ];
    const result = mergeThreats(prev, incoming);
    expect(result.length).toBe(2);
    expect(result.find((t) => t.id === "WFVT-006")).toBeDefined();
    expect(result.find((t) => t.id === "WFVT-007")).toBeDefined();
  });

  test("merges sessions from same threat across polls", () => {
    const prev = [
      {
        id: "WFVT-006",
        status: "DETECTED",
        score: 8.6,
        severity: "High",
        sessions: [{ firstSeen: 100, lastSeen: null, state: "DETECTED" }],
        occurrences: 0,
      },
    ];
    const incoming = [
      {
        id: "WFVT-006",
        status: "CLEARED",
        score: 8.6,
        severity: "High",
        detectedTime: 200,
        activeCount: 0,
        activeSession: null,
        raw: [],
        sessions: [
          { firstSeen: 100, lastSeen: 160, state: "CLEARED" },
          { firstSeen: 200, lastSeen: null, state: "DETECTED" },
        ],
        occurrences: 1,
      },
    ];

    const result = mergeThreats(prev, incoming);
    expect(result.length).toBe(1);

    const threat = result[0];
    expect(threat.sessions.length).toBe(2);
    expect(threat.status).toBe("CLEARED");
    // Session at firstSeen=100 should be updated from DETECTED to CLEARED
    const s100 = threat.sessions.find((s) => s.firstSeen === 100);
    expect(s100.state).toBe("CLEARED");
    expect(s100.lastSeen).toBe(160);
    // Session at firstSeen=200 should be new
    const s200 = threat.sessions.find((s) => s.firstSeen === 200);
    expect(s200).toBeDefined();
    expect(s200.state).toBe("DETECTED");
  });

  test("occurrences count equals number of CLEARED sessions", () => {
    const prev = [
      {
        id: "WFVT-006",
        status: "DETECTED",
        sessions: [
          { firstSeen: 100, lastSeen: 160, state: "CLEARED" },
          { firstSeen: 200, lastSeen: null, state: "DETECTED" },
        ],
        occurrences: 1,
      },
    ];
    const incoming = [
      {
        id: "WFVT-006",
        status: "CLEARED",
        activeCount: 0,
        activeSession: null,
        raw: [],
        sessions: [
          { firstSeen: 100, lastSeen: 160, state: "CLEARED" },
          { firstSeen: 200, lastSeen: 260, state: "CLEARED" },
        ],
      },
    ];

    const result = mergeThreats(prev, incoming);
    const threat = result[0];
    expect(threat.occurrences).toBe(2); // two CLEARED sessions
  });

  test("does not duplicate sessions with same firstSeen", () => {
    const prev = [
      {
        id: "WFVT-006",
        status: "DETECTED",
        sessions: [{ firstSeen: 100, lastSeen: null, state: "DETECTED" }],
      },
    ];
    const incoming = [
      {
        id: "WFVT-006",
        status: "DETECTED",
        activeCount: 1,
        raw: [],
        sessions: [{ firstSeen: 100, lastSeen: null, state: "DETECTED" }],
      },
    ];

    const result = mergeThreats(prev, incoming);
    expect(result[0].sessions.length).toBe(1); // no duplicate
  });

  test("preserves prev threats even when incoming has different threats", () => {
    const prev = [
      {
        id: "WFVT-006",
        status: "CLEARED",
        sessions: [{ firstSeen: 100, lastSeen: 160, state: "CLEARED" }],
      },
    ];
    const incoming = [
      {
        id: "WFVT-008",
        status: "DETECTED",
        sessions: [{ firstSeen: 300, state: "DETECTED" }],
      },
    ];

    const result = mergeThreats(prev, incoming);
    expect(result.length).toBe(2);
    expect(result.find((t) => t.id === "WFVT-006")).toBeDefined(); // prev preserved
    expect(result.find((t) => t.id === "WFVT-008")).toBeDefined(); // new appended
  });
});
