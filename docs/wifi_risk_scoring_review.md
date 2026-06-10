# WiFi Risk Scoring Review and Proposed Improvement Plan

## 1. Current / Existing Computation Algorithm

The current scoring model is based on the OWASP Risk Rating Methodology, NIST SP 800-30 Rev.1, and CVSS v4.0 severity scores.

### Per-Item Risk

For each detected vulnerability or threat:

[
R_i = P_i \times CVSS_i
]

Where:

* (P_i = 1) if the vulnerability is detected
* (P_i = 0) if the vulnerability is not detected
* (CVSS_i) is the assigned CVSS score from the WFVT dataset

### Total Observed Risk

The risk contributions of all detected findings are summed:

[
R_{observed} = \sum (P_i \times CVSS_i)
]

### Normalization

The total observed risk is normalized using the maximum possible WFVT score:

[
WiFiRiskScore = \frac{R_{observed}}{R_{max}} \times 100
]

Where:

[
R_{max} = 60.7
]

which is the sum of all CVSS scores in the WFVT dataset.

---

## 2. Current Dilemma

### Problem 1: Critical Vulnerabilities Appear Too Low

Example:

Detected Findings:

* Open Authentication (CVSS 9.4)

Computation:

[
WiFiRiskScore = \frac{9.4}{60.7} \times 100
]

[
WiFiRiskScore = 15.49%
]

Result:

* Risk Score = 15.49%

Issue:

Open Authentication is classified as a Critical vulnerability in the WFVT dataset, yet the resulting score appears low.

This creates a mismatch between:

* CVSS severity (Critical)
* Displayed WiFi Risk Score (15%)

---

### Problem 2: User Interpretation

The captive portal is designed for end-users.

When users see:

Risk Score: 15%

they may interpret the network as relatively safe even though a critical vulnerability is present.

---

### Problem 3: Exposure vs Severity

The current formula measures:

> "How much of the WFVT threat model is present?"

However, end-users often interpret the displayed score as:

> "How dangerous is this WiFi network?"

These are two different concepts.

---

## 3. Initial Alternatives Considered

Several alternatives were discussed:

### Option A: Severity Override

Example:

If any detected CVSS ≥ 9.0

Then:

Minimum Classification = High

Issue:

The score remains 15%, but the classification becomes High.

This creates inconsistency between the numerical score and the risk level.

---

### Option B: Max-CVSS Only

[
WiFiRiskScore =
\frac{\max(CVSS_{detected})}{10}
\times 100
]

Advantages:

* Open Authentication immediately becomes 94%.
* Easy for users to understand.

Disadvantages:

Two networks with very different findings may receive the same score.

Example:

Network A:

* Open Authentication

Network B:

* Open Authentication
* Evil Twin
* Deauthentication
* PMF Disabled

Both produce:

94%

This ignores cumulative exposure.

---

## 4. Proposed Solution

### Separate Severity and Exposure

Instead of forcing one score to represent both concepts, use two metrics.

---

# A. User-Facing Metric (Captive Portal)

## WiFi Risk Score

Purpose:

> Communicate the severity of the most dangerous detected threat.

Formula:

[
WiFiRiskScore =
\frac{\max(CVSS_{detected})}{10}
\times100
]

Example:

Detected:

* Open Authentication (9.4)

[
94%
]

Displayed to users:

WiFi Risk Score: 94%

Risk Level: Critical

This aligns with user expectations and prevents underestimating critical vulnerabilities.

---

# B. Administrative Metric (Web Application)

## Exposure Score

Purpose:

> Measure cumulative network exposure based on all detected WFVT findings.

Formula:

[
ExposureScore
=============

\frac{\sum(P_i\times CVSS_i)}
{60.7}
\times100
]

Example:

Detected:

* Open Authentication (9.4)
* Evil Twin (9.3)
* Deauthentication (8.5)

[
ExposureScore
=============

\frac{27.2}{60.7}
\times100
]

[
ExposureScore
=============

44.81%
]

This allows administrators to compare the overall attack surface of different networks.

---

## 5. Recommended Dashboard Design

### Captive Portal (End Users)

Display:

* WiFi Risk Score
* Risk Level
* Risk Description
* Recommendations

Example:

WiFi Risk Score: 94%

Risk Level: Critical

This network uses Open Authentication, which does not encrypt wireless communications and may expose user traffic to interception.

---

### Administrative Dashboard

Network List:

| SSID            | Risk Score | Exposure Score | Findings |
| --------------- | ---------- | -------------- | -------- |
| DMall_Free_WiFi | 94%        | 44.81%         | 3        |
| CoffeeShop_WiFi | 76%        | 24.22%         | 2        |
| HomeRouter      | 71%        | 11.70%         | 1        |

Network Details:

* WiFi Risk Score
* Exposure Score
* Findings Count
* Critical Findings Count
* Detected Threats and Vulnerabilities
* Recommendations

---

## 6. Academic Justification

### NIST SP 800-30 Rev.1

Defines risk as a function of likelihood and impact.

Supports:

[
R_i = P_i \times CVSS_i
]

where:

* Presence represents likelihood.
* CVSS represents impact.

---

### OWASP Risk Rating Methodology

Defines risk through likelihood and impact analysis.

Supports the use of binary presence indicators and severity values.

---

### CVSS v4.0 Specification

The CVSS Base Score represents the intrinsic severity of a vulnerability.

Supports using:

[
\max(CVSS_{detected})
]

for communicating the severity of the most dangerous detected threat.

---

## 7. Final Recommendation

### Captive Portal

Use:

[
WiFiRiskScore =
\frac{\max(CVSS_{detected})}{10}
\times100
]

Purpose:

* User awareness
* Risk communication
* Immediate understanding of danger

---

### Administrative Dashboard

Use:

[
ExposureScore =
\frac{\sum(P_i\times CVSS_i)}
{60.7}
\times100
]

Purpose:

* Network exposure assessment
* Threat accumulation tracking
* Remediation prioritization

This dual-metric approach preserves the existing research methodology while improving how risk is communicated to end-users.
