const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Local disk storage for cook verification documents (Aadhaar / PAN / photo).
// Files go to <backend>/uploads/cook-docs and are served via /uploads.
const uploadDir = path.join(__dirname, "..", "uploads", "cook-docs");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path
      .basename(file.originalname, ext)
      .replace(/[^a-z0-9-_]+/gi, "_")
      .slice(0, 40);
    cb(null, `${file.fieldname}_${req.user?.id || "anon"}_${Date.now()}_${base}${ext}`);
  },
});

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
  const err = new Error("Only JPG, PNG, WEBP images or PDF files are allowed");
  err.statusCode = 400;
  cb(err);
};

const cookDocUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB per file
});

module.exports = { cookDocUpload, cookDocUploadDir: uploadDir };
