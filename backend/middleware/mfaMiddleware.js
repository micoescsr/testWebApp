// middleware/mfaMiddleware.js
// Enforces AAL2 (MFA-verified) sessions on routes that mutate data or expose
// sensitive info. Must run AFTER authJWT — reads req.user.aal, does not
// verify the JWT itself.
const { logAuditEvent } = require("../utils/auditLogger");

exports.requireAAL2 = async (req, res, next) => {
  if (req.user?.aal === "aal2") return next();

  logAuditEvent({
    req,
    actorId: req.user?.id,
    eventName: "AUTHORIZATION.DENIED",
    eventStatus: "DENIED",
    entityType: "AUTH",
    entityIdUuid: req.user?.id,
    meta: { reason: "aal_insufficient", aal: req.user?.aal, path: req.originalUrl },
  }).catch(() => {});

  return res.status(403).json({
    error: "This action requires multi-factor authentication (AAL2).",
    code: "MFA_REQUIRED",
  });
};
