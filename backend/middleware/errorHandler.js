const errorHandler = (err, req, res, next) => {
  // Invalid MongoDB ObjectId in URL params -> 404, not 500
  // Expected client error: skip stack logging to keep logs clean
  if (err.name === "CastError") {
    return res.status(404).json({ message: "Resource not found" });
  }

  // Client-caused schema failures (bad enum, missing required, etc.) are
  // 400s, not 500s.
  if (err.name === "ValidationError") {
    return res.status(400).json({ message: err.message || "Validation failed" });
  }

  console.error(err.stack);

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    message: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

module.exports = errorHandler;
