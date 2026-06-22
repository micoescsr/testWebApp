# Phase 7 Resume Prompt — Migrate Rogue Modals to BaseModal

Paste the block below into Claude Code (VS Code terminal) as a fresh session.

**Model:** Opus 4.6 medium — small scoped refactor, 2 files, low complexity.

---

```
Use .agents/agents/ui-agent.md as your workflow.

RESUME: Why-PII? SOC redesign, Phase 7 of 7 (migrate rogue modals to BaseModal).

Done so far (all committed, build green, 20/20 tests pass, on branch mico-testing-branch):
- P1 tokens (src/styles/tokens.css), P2 SeverityBadge, P3 theme provider + toggle.
- P4 tokenized app shell + 5 SOC screens. Zero hardcoded color.
- P5 tokenized remaining in-app CSS (17 files: shared components, modals, drawers, Profile).
- P6 Phosphor icons: sidebar emojis, SeverityBadge glyphs, all inline SVGs replaced.
- Plan file: ~/.claude/plans/use-agents-agents-ui-agent-md-as-your-warm-goblet.md
- Memory: soc-redesign-progress.md (read it first for full state).

The problem P7 fixes: FindingDetailModal and RawEvidenceModal each have their
own hand-rolled overlay/container/close markup instead of using the existing
BaseModal component (src/components/common/Modal/BaseModal.jsx + BaseModal.css).
This means duplicated overlay CSS, inconsistent focus/escape/scroll behavior,
and more surface area to maintain. P7 = migrate both to BaseModal.

IN SCOPE:
- src/components/modals/FindingDetailModal/FindingDetailModal.jsx + .css
- src/components/modals/RawEvidenceModal/RawEvidenceModal.jsx + .css

What BaseModal provides (read BaseModal.jsx first to confirm):
- Overlay backdrop with click-to-close
- Centered container with consistent styling (already tokenized in P5)
- Header slot, body slot, footer slot
- Close button
- Escape key handling (if implemented)

Migration approach:
1. Read BaseModal.jsx to understand its API (props, slots, behavior).
2. Read FindingDetailModal.jsx — identify which parts are overlay/container
   (replace with BaseModal) vs. content (keep as BaseModal children).
3. Refactor FindingDetailModal to render inside BaseModal. Remove its
   hand-rolled .modal-overlay / .modal-content / .modal-header / .modal-close
   markup and the corresponding CSS. Keep all content/logic unchanged.
4. Build, verify, commit.
5. Same for RawEvidenceModal — remove .raw-evidence-overlay / .raw-evidence-modal
   wrapper markup; render content inside BaseModal. Keep tabs/formatted/JSON
   view logic unchanged.
6. Build, verify, commit.
7. Clean up: remove now-dead overlay/container CSS from both modal CSS files.
   Grep for any orphaned class references.

Rules:
- Behavior-preserving refactor. No logic/markup/routing changes beyond the
  modal wrapper swap.
- Preserve all existing content, tabs, buttons, responsive breakpoints.
- Preserve existing class names on content elements (only overlay/container
  classes should change).
- After each modal: npm run build (must stay green), npm run test (20/20).
- Verify: both modals should open/close correctly via their existing triggers.

OUT OF SCOPE (do NOT touch):
- Other modals (LogoutConfirmModal, StopDetectionModal, ScanConfirmModal,
  AccountsAuditModal) — these already use BaseModal or are fine as-is.
- DataTable/Button/Card primitives — separate effort.
- Any new features or UI changes.

Stop after P7. Show diffs + verification. Update memory with completion.
The full 7-phase SOC redesign will be complete.
```
