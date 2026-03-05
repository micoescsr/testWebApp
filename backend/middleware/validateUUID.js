// middleware/validateUUID.js
// Phase 5-A: UUID format validation middleware.
// Returns 400 on invalid UUID format instead of letting Postgres error bubble.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Factory: returns middleware that validates one or more route params as UUIDs.
 * @param {...string} paramNames - req.params keys to validate (default: 'id')
 *
 * Usage:
 *   router.put('/profiles/:id', authJWT, validateUUID('id'), handler)
 *   router.get('/ap-state/:networkId', authJWT, validateUUID('networkId'), handler)
 */
function validateUUID(...paramNames) {
  const names = paramNames.length ? paramNames : ['id'];

  return (req, res, next) => {
    for (const name of names) {
      const value = req.params[name];
      if (value !== undefined && !UUID_RE.test(value)) {
        return res.status(400).json({
          error: 'INVALID_UUID',
          message: `Parameter "${name}" must be a valid UUID.`,
        });
      }
    }
    next();
  };
}

module.exports = { validateUUID };
