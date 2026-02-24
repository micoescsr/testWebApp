// routes/captivePortalRoutes.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/captivePortalController');

// ─── Announcement ────────────────────────────────────────────────
router.get('/announcement', ctrl.getAnnouncement);
router.get('/announcement/history', ctrl.getAnnouncementHistory);
router.post('/announcement', ctrl.publishAnnouncement);

// ─── Terms & Conditions ──────────────────────────────────────────
router.get('/terms', ctrl.getTerms);
router.get('/terms/history', ctrl.getTermsHistory);
router.post('/terms', ctrl.publishTerms);

// ─── Tips ────────────────────────────────────────────────────────
router.get('/tips', ctrl.getTips);
router.post('/tips', ctrl.upsertTips);

// ─── Risk Classification ─────────────────────────────────────────
router.get('/risk-classifications', ctrl.getRiskClassifications);

// ─── Portal (preview + sync to FastAPI) ──────────────────────────
router.get('/summary', ctrl.getPortalSummary);
router.post('/sync', ctrl.syncPortal);

module.exports = router;
