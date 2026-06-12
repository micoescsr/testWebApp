# ZAP by Checkmarx Scanning Report
**Date:** June 13, 2026
**Site:** http://localhost:5173
**Generated on:** Sat, 13 Jun 2026 00:49:26
**ZAP Version:** 2.17.0

---

## Scan Configuration

### General Settings

| Setting | Value |
|---|---|
| **Target URL** | http://localhost:5173/ |
| **Scan Policy** | Pen Test |
| **Traditional Spider** | ✅ Enabled |
| **Ajax Spider** | ✅ Enabled — If Modern with Chrome |

### Scan Policy — Filter Settings

| Category | Setting |
|---|---|
| **Include Risks** | High, Medium, Low |
| **Excluded Risks** | Informational |
| **Include Confidences** | Confirmed, High, Medium |
| **Excluded Confidences** | Low, False Positive |

### Report Template

| Setting | Value |
|---|---|
| **Template** | Traditional PDF Report |
| **Sections** | Alert Count, Insights, Instance Chart, Alert Details |

---

## Summary of Alerts

| Risk Level | Number of Alerts |
|---|---|
| 🔴 High | 0 |
| 🟠 Medium | 2 |
| 🟡 Low | 1 |

---

## Alerts Overview

| Name | Risk Level | Instances |
|---|---|---|
| Content Security Policy (CSP) Header Not Set | 🟠 Medium | 3 |
| Missing Anti-clickjacking Header | 🟠 Medium | 3 |
| X-Content-Type-Options Header Missing | 🟡 Low | Systemic |

---

## Alert Details

### 🟠 [Medium] Content Security Policy (CSP) Header Not Set

**Description**
Content Security Policy (CSP) is an added layer of security that helps detect and mitigate certain types of attacks, including Cross Site Scripting (XSS) and data injection attacks. CSP provides a set of standard HTTP headers that allow website owners to declare approved sources of content that browsers should be allowed to load on that page — covered types are JavaScript, CSS, HTML frames, fonts, images, and embeddable objects.

**Affected URLs**

| URL | Method |
|---|---|
| http://localhost:5173/ | GET |
| http://localhost:5173/robots.txt | GET |
| http://localhost:5173/sitemap.xml | GET |

**Instances:** 3

**Solution**
Ensure that your web server, application server, load balancer, etc. is configured to set the `Content-Security-Policy` header.

**References**
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP
- https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html
- https://content-security-policy.com/

**CWE ID:** 693 | **WASC ID:** 15 | **Plugin ID:** 10038

---

### 🟠 [Medium] Missing Anti-clickjacking Header

**Description**
The response does not protect against Clickjacking attacks. It should include either `Content-Security-Policy` with the `frame-ancestors` directive or the `X-Frame-Options` header.

**Affected URLs**

| URL | Method |
|---|---|
| http://localhost:5173/ | GET |
| http://localhost:5173/robots.txt | GET |
| http://localhost:5173/sitemap.xml | GET |

**Instances:** 3

**Solution**
Modern web browsers support the `Content-Security-Policy` and `X-Frame-Options` HTTP headers. Ensure one of them is set on all web pages returned by your app.

- If the page should only be framed by pages on your own server → use `SAMEORIGIN`
- If the page should never be framed → use `DENY`
- Alternatively, implement CSP's `frame-ancestors` directive

**References**
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Frame-Options

**CWE ID:** 1021 | **WASC ID:** 15 | **Plugin ID:** 10020

---

### 🟡 [Low] X-Content-Type-Options Header Missing

**Description**
The anti-MIME-sniffing header `X-Content-Type-Options` was not set to `nosniff`. This allows older browsers to perform MIME-sniffing on the response body, potentially causing it to be interpreted as a different content type than declared. This issue also applies to error pages (401, 403, 500, etc.).

**Affected URLs**

| URL | Method |
|---|---|
| http://localhost:5173/ | GET |
| http://localhost:5173/robots.txt | GET |
| http://localhost:5173/sitemap.xml | GET |
| http://localhost:5173/src/main.jsx | GET |
| http://localhost:5173/vite.svg | GET |

**Instances:** Systemic

**Solution**
Ensure that the application/web server sets the `Content-Type` header appropriately, and sets the `X-Content-Type-Options` header to `nosniff` for all web pages.

**References**
- https://owasp.org/www-community/Security_Headers

**CWE ID:** 693 | **WASC ID:** 15 | **Plugin ID:** 10021

---

## Recommended Fixes

### 1. Add Security Headers (fixes all 3 alerts)

If you're using **Vite** (port 5173), add the following to your `vite.config.js`:

```js
export default {
  server: {
    headers: {
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self';",
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
    }
  }
}
```

Or if you have an **Express** backend:

```js
const helmet = require('helmet');
app.use(helmet());
```

---

## Conclusion

| Finding | Status |
|---|---|
| No High severity vulnerabilities found | ✅ Good |
| 2 Medium issues — missing security headers | ⚠️ Fix recommended |
| 1 Low issue — systemic across all responses | ℹ️ Fix recommended |

> All findings are related to missing HTTP security headers. No injection, XSS, or auth vulnerabilities were detected. These can be resolved by configuring the appropriate headers in your server or framework.
