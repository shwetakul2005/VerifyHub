function requireIdempotencyKey(req, res, next) {
    const key = req.get("Idempotency-Key")?.trim();
    if (!key || key.length > 128) {
        return res.status(400).json({
            success: false,
            code: "IDEMPOTENCY_KEY_REQUIRED",
            message: "A valid Idempotency-Key header is required."
        });
    }
    req.idempotencyKey = key;
    return next();
}

module.exports = { requireIdempotencyKey };
