const generateSlug = (text) => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
};

const formatTime = (time) => {
  return time;
};

module.exports = { generateSlug, formatTime };
