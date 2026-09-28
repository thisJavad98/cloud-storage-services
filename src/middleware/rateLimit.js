/**
 * Lightweight in-memory rate limiter (per-process).
 * Good enough for a single Render/Node instance.
 */
function createRateLimiter({
  windowMs = 60_000,
  max = 60,
  message = 'Too many requests, please try again later',
} = {}) {
  const hits = new Map();

  function prune(now) {
    for (const [key, entry] of hits.entries()) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }

  return function rateLimit(req, res, next) {
    const now = Date.now();
    if (hits.size > 5000) prune(now);

    const key = `${req.ip || 'unknown'}:${req.path}`;
    let entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    entry.count += 1;

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader(
      'X-RateLimit-Remaining',
      String(Math.max(0, max - entry.count))
    );
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      return res.status(429).json({
        success: false,
        message,
      });
    }

    return next();
  };
}

module.exports = {
  createRateLimiter,
};
