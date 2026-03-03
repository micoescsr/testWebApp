// routes/captivePortalRoutes.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/captivePortalController');
const { authJWT } = require('../middleware/authMiddleware');

// ─── Announcement ────────────────────────────────────────────────
router.get('/announcement', ctrl.getAnnouncement);
router.get('/announcement/history', ctrl.getAnnouncementHistory);
router.post('/announcement', authJWT, ctrl.publishAnnouncement);

// ─── Terms & Conditions ──────────────────────────────────────────
router.get('/terms', ctrl.getTerms);
router.get('/terms/history', ctrl.getTermsHistory);
router.post('/terms', authJWT, ctrl.publishTerms);

// ─── Tips ────────────────────────────────────────────────────────
router.get('/tips', ctrl.getTips);
router.post('/tips', authJWT, ctrl.upsertTips);

// ─── Risk Classification ─────────────────────────────────────────
router.get('/risk-classifications', ctrl.getRiskClassifications);

// ─── Portal (preview + sync to FastAPI) ──────────────────────────
router.get('/summary', ctrl.getPortalSummary);
router.post('/sync', authJWT, ctrl.syncPortal);

module.exports = router;
