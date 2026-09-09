const { validationResult } = require("express-validator");

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const list = errors.array();
    // Frontend forms read `data.message` — surface the first failure there
    // while keeping the full list for debugging.
    return res.status(400).json({ message: list[0].msg, errors: list });
  }
  next();
};

module.exports = validate;
