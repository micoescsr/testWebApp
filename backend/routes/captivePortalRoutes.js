// routes/captivePortalRoutes.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/captivePortalController');
const { authJWT } = require('../middleware/authMiddleware');
const { requireActiveProfile } = require('../middleware/statusMiddleware');
const { requireAAL2 } = require('../middleware/mfaMiddleware');
const { validate, portalAnnouncement, portalTips, portalSync } = require('../validators/routeValidators');

// ─── Phase 2-A: All captive-portal routes require JWT ───────────
// Previously GETs were public — anyone could read portal content
// and risk classifications without authenticating.

// ─── Announcement ────────────────────────────────────────────────
router.get('/announcement', authJWT, requireActiveProfile, requireAAL2, ctrl.getAnnouncement);
router.get('/announcement/history', authJWT, requireActiveProfile, requireAAL2, ctrl.getAnnouncementHistory);
router.post('/announcement', authJWT, requireActiveProfile, requireAAL2, portalAnnouncement, validate, ctrl.publishAnnouncement);

// ─── Tips ────────────────────────────────────────────────────────
router.get('/tips', authJWT, requireActiveProfile, requireAAL2, ctrl.getTips);
router.post('/tips', authJWT, requireActiveProfile, requireAAL2, portalTips, validate, ctrl.upsertTips);

// ─── Risk Classification ─────────────────────────────────────────
router.get('/risk-classifications', authJWT, requireActiveProfile, requireAAL2, ctrl.getRiskClassifications);

// ─── Portal (preview + sync to FastAPI) ──────────────────────────
router.get('/summary', authJWT, requireActiveProfile, requireAAL2, ctrl.getPortalSummary);
router.post('/sync', authJWT, requireActiveProfile, requireAAL2, portalSync, validate, ctrl.syncPortal);

module.exports = router;
