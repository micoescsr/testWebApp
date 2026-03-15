// backend/validators/routeValidators.js
// Input validators for all POST/PUT routes using express-validator.
// Pattern: export named arrays of validation chains + shared validate() runner.

const { body, param, validationResult } = require('express-validator');

// ─── Shared validate runner ─────────────────────────────────────
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', errors: errors.array() });
  }
  next();
}

// ─── UUID regex (reuse across validators) ────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ═══════════════════════════════════════════════════════════════════
//  Detect Validators
// ═══════════════════════════════════════════════════════════════════

const detectStart = [
  body('network_id')
    .exists({ checkFalsy: true }).withMessage('network_id is required')
    .isString().withMessage('network_id must be a string')
    .matches(UUID_RE).withMessage('network_id must be a valid UUID'),
  body('scan_id')
    .exists({ checkFalsy: true }).withMessage('scan_id is required')
    .custom((value) => {
      const num = Number(value);
      if (!Number.isFinite(num) || num <= 0 || String(value).includes('-')) {
        throw new Error('scan_id must be a positive integer (bigint), not a UUID');
      }
      return true;
    }),
];

const STOP_REASON_CODES = [
  'MAINTENANCE', 'DEVICE_RESTART', 'FALSE_POSITIVES',
  'CLIENT_REQUEST', 'SCOPE_CHANGE', 'EVIDENCE_PRESERVATION', 'OTHER',
];

const detectStop = [
  body('reason_code')
    .exists({ checkFalsy: true }).withMessage('reason_code is required')
    .isIn(STOP_REASON_CODES).withMessage(`reason_code must be one of: ${STOP_REASON_CODES.join(', ')}`),
  body('reason_note')
    .optional()
    .isString().withMessage('reason_note must be a string')
    .isLength({ max: 500 }).withMessage('reason_note max 500 characters'),
];

// ═══════════════════════════════════════════════════════════════════
//  Captive Portal Validators
// ═══════════════════════════════════════════════════════════════════

const portalAnnouncement = [
  body('network_id')
    .exists({ checkFalsy: true }).withMessage('network_id is required')
    .isString().withMessage('network_id must be a string')
    .matches(UUID_RE).withMessage('network_id must be a valid UUID'),
  body('content')
    .optional()
    .isString().withMessage('content must be a string')
    .isLength({ max: 2000 }).withMessage('content max 2000 characters'),
];

const portalTips = [
  body('network_id')
    .exists({ checkFalsy: true }).withMessage('network_id is required')
    .isString().withMessage('network_id must be a string')
    .matches(UUID_RE).withMessage('network_id must be a valid UUID'),
  body('tips')
    .isArray({ min: 1, max: 20 }).withMessage('tips must be an array (1–20 items)'),
  body('tips.*.tip_text')
    .isString().withMessage('Each tip must have a tip_text string')
    .isLength({ min: 1, max: 300 }).withMessage('tip_text must be 1–300 characters'),
  body('tips.*.sort_order')
    .optional()
    .isInt({ min: 0 }).withMessage('sort_order must be a non-negative integer'),
];

const portalSync = [
  body('network_id')
    .exists({ checkFalsy: true }).withMessage('network_id is required')
    .isString().withMessage('network_id must be a string')
    .matches(UUID_RE).withMessage('network_id must be a valid UUID'),
];

// ═══════════════════════════════════════════════════════════════════
//  User Validators
// ═══════════════════════════════════════════════════════════════════

const VALID_ROLES = ['superadmin', 'admin', 'viewer'];
const VALID_STATUSES = ['active', 'inactive', 'on_hold'];

const userUpdate = [
  body('first_name').optional().isString().isLength({ min: 1, max: 100 }).withMessage('first_name must be 1–100 chars'),
  body('last_name').optional().isString().isLength({ min: 1, max: 100 }).withMessage('last_name must be 1–100 chars'),
  body('username').optional().isString().isLength({ min: 1, max: 100 }).withMessage('username must be 1–100 chars'),
  body('email').optional().isEmail().normalizeEmail().withMessage('email must be valid'),
  body('role').optional().isIn(VALID_ROLES).withMessage(`role must be one of: ${VALID_ROLES.join(', ')}`),
  body('status').optional().isIn(VALID_STATUSES).withMessage(`status must be one of: ${VALID_STATUSES.join(', ')}`),
];

const userActivateWithTemp = [
  body('first_name').exists({ checkFalsy: true }).isString().isLength({ min: 1, max: 100 }).withMessage('first_name is required (1–100 chars)'),
  body('last_name').exists({ checkFalsy: true }).isString().isLength({ min: 1, max: 100 }).withMessage('last_name is required (1–100 chars)'),
  body('username').exists({ checkFalsy: true }).isString().isLength({ min: 1, max: 100 }).withMessage('username is required (1–100 chars)'),
  body('email').exists({ checkFalsy: true }).isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('role').exists({ checkFalsy: true }).isIn(VALID_ROLES).withMessage(`role must be one of: ${VALID_ROLES.join(', ')}`),
];

const userDeactivate = [
  body('anonymize').optional().isBoolean().withMessage('anonymize must be a boolean'),
];

const userReactivate = [
  body('targetStatus')
    .optional()
    .isIn(['active', 'on_hold']).withMessage("targetStatus must be 'active' or 'on_hold'"),
  body('issueTempPassword').optional().isBoolean().withMessage('issueTempPassword must be a boolean'),
  body('profileUpdates').optional().isObject().withMessage('profileUpdates must be an object'),
  body('profileUpdates.first_name').optional().isString().isLength({ max: 100 }).withMessage('first_name max 100 chars'),
  body('profileUpdates.last_name').optional().isString().isLength({ max: 100 }).withMessage('last_name max 100 chars'),
  body('profileUpdates.username').optional().isString().isLength({ max: 100 }).withMessage('username max 100 chars'),
  body('profileUpdates.email').optional().isEmail().withMessage('profileUpdates.email must be valid'),
  body('profileUpdates.role').optional().isIn(VALID_ROLES).withMessage(`role must be one of: ${VALID_ROLES.join(', ')}`),
];

// ═══════════════════════════════════════════════════════════════════
//  RasPi Validators
// ═══════════════════════════════════════════════════════════════════

const BSSID_RE = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;

const rasPiScan = [
  body('ssid')
    .exists({ checkFalsy: true }).withMessage('ssid is required')
    .isString().isLength({ min: 1, max: 64 }).withMessage('ssid must be 1–64 chars'),
  body('bssid')
    .exists({ checkFalsy: true }).withMessage('bssid is required')
    .isString()
    .matches(BSSID_RE).withMessage('bssid must be a valid MAC address (XX:XX:XX:XX:XX:XX)'),
  body('channel')
    .exists().withMessage('channel is required')
    .isInt({ min: 1, max: 200 }).withMessage('channel must be an integer (1–200)'),
];

const rasPiSaveNetwork = [
  body('ssid')
    .exists({ checkFalsy: true }).withMessage('ssid is required')
    .isString().isLength({ min: 1, max: 64 }).withMessage('ssid must be 1–64 chars'),
  body('bssid')
    .exists({ checkFalsy: true }).withMessage('bssid is required')
    .isString()
    .matches(BSSID_RE).withMessage('bssid must be a valid MAC address (XX:XX:XX:XX:XX:XX)'),
  body('channel')
    .exists().withMessage('channel is required')
    .isInt({ min: 1, max: 200 }).withMessage('channel must be an integer (1–200)'),
  body('city').optional().isString().isLength({ max: 100 }).withMessage('city max 100 chars'),
  body('province').optional().isString().isLength({ max: 100 }).withMessage('province max 100 chars'),
  body('notes').optional().isString().isLength({ max: 500 }).withMessage('notes max 500 chars'),
  body('scan').optional().isObject().withMessage('scan must be an object'),
];

// ═══════════════════════════════════════════════════════════════════
//  Device Management Validators
// ═══════════════════════════════════════════════════════════════════

const deviceEnableAp = [
  body('network_id')
    .exists({ checkFalsy: true }).withMessage('network_id is required')
    .isString()
    .matches(UUID_RE).withMessage('network_id must be a valid UUID'),
  body('ap_status')
    .exists({ checkFalsy: true }).withMessage('ap_status is required')
    .isIn(['enable', 'disable']).withMessage("ap_status must be 'enable' or 'disable'"),
  body('scan_id')
    .optional()
    .isString()
    .matches(UUID_RE).withMessage('scan_id must be a valid UUID'),
  body('ap_password')
    .optional()
    .isString().isLength({ max: 128 }).withMessage('ap_password max 128 chars'),
];

const devicePortalUpdate = [
  body('network_id')
    .exists({ checkFalsy: true }).withMessage('network_id is required')
    .isString()
    .matches(UUID_RE).withMessage('network_id must be a valid UUID'),
  body('update_type')
    .exists({ checkFalsy: true }).withMessage('update_type is required')
    .isIn(['announcement', 'tips', 'risk', 'active', 'bulk'])
    .withMessage("update_type must be one of: announcement, tips, risk, active, bulk"),
  body('payload')
    .exists().withMessage('payload is required')
    .isObject().withMessage('payload must be an object'),
];

// ═══════════════════════════════════════════════════════════════════
//  Async AP Job Validators
// ═══════════════════════════════════════════════════════════════════

// Matches Pi job IDs like "orch_1773418826_72ddfac4"
const JOB_ID_RE = /^orch_\d+_[a-f0-9]+$/;

const deviceJobPoll = [
  param('jobId')
    .exists({ checkFalsy: true }).withMessage('jobId is required')
    .isString()
    .isLength({ max: 64 }).withMessage('jobId must be at most 64 characters')
    .matches(JOB_ID_RE).withMessage('jobId format is invalid'),
];

module.exports = {
  validate,
  detectStart,
  detectStop,
  portalAnnouncement,
  portalTips,
  portalSync,
  userUpdate,
  userActivateWithTemp,
  userDeactivate,
  userReactivate,
  rasPiScan,
  rasPiSaveNetwork,
  deviceEnableAp,
  devicePortalUpdate,
  deviceJobPoll,
};
