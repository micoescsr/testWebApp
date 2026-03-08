// routes/captivePortalRoutes.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/captivePortalController');
const { authJWT } = require('../middleware/authMiddleware');
const { validate, portalAnnouncement, portalTips, portalSync } = require('../validators/routeValidators');

// ─── Phase 2-A: All captive-portal routes require JWT ───────────
// Previously GETs were public — anyone could read portal content
// and risk classifications without authenticating.

// ─── Announcement ────────────────────────────────────────────────
router.get('/announcement', authJWT, ctrl.getAnnouncement);
router.get('/announcement/history', authJWT, ctrl.getAnnouncementHistory);
router.post('/announcement', authJWT, portalAnnouncement, validate, ctrl.publishAnnouncement);

// ─── Tips ────────────────────────────────────────────────────────
router.get('/tips', authJWT, ctrl.getTips);
router.post('/tips', authJWT, portalTips, validate, ctrl.upsertTips);

// ─── Risk Classification ─────────────────────────────────────────
router.get('/risk-classifications', authJWT, ctrl.getRiskClassifications);

// ─── Portal (preview + sync to FastAPI) ──────────────────────────
router.get('/summary', authJWT, ctrl.getPortalSummary);
router.post('/sync', authJWT, portalSync, validate, ctrl.syncPortal);

module.exports = router;
