// routes/captivePortalRoutes.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/captivePortalController');
const { authJWT } = require('../middleware/authMiddleware');
const { requireActiveProfile } = require('../middleware/statusMiddleware');
const { validate, portalAnnouncement, portalTips, portalSync } = require('../validators/routeValidators');

// ─── Phase 2-A: All captive-portal routes require JWT ───────────
// Previously GETs were public — anyone could read portal content
// and risk classifications without authenticating.

// ─── Announcement ────────────────────────────────────────────────
router.get('/announcement', authJWT, requireActiveProfile, ctrl.getAnnouncement);
router.get('/announcement/history', authJWT, requireActiveProfile, ctrl.getAnnouncementHistory);
router.post('/announcement', authJWT, requireActiveProfile, portalAnnouncement, validate, ctrl.publishAnnouncement);

// ─── Tips ────────────────────────────────────────────────────────
router.get('/tips', authJWT, requireActiveProfile, ctrl.getTips);
router.post('/tips', authJWT, requireActiveProfile, portalTips, validate, ctrl.upsertTips);

// ─── Risk Classification ─────────────────────────────────────────
router.get('/risk-classifications', authJWT, requireActiveProfile, ctrl.getRiskClassifications);

// ─── Portal (preview + sync to FastAPI) ──────────────────────────
router.get('/summary', authJWT, requireActiveProfile, ctrl.getPortalSummary);
router.post('/sync', authJWT, requireActiveProfile, portalSync, validate, ctrl.syncPortal);

module.exports = router;
