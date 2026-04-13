const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

/** Max size for one course video file (single POST or assembled chunks). Override with COURSE_VIDEO_MAX_BYTES. */
const COURSE_VIDEO_MAX_BYTES = Number(process.env.COURSE_VIDEO_MAX_BYTES) || 2 * 1024 * 1024 * 1024; // 2GB default

/** One chunk in chunked upload (keep under common reverse-proxy limits, e.g. 25–50MB). */
const COURSE_VIDEO_CHUNK_MAX_BYTES =
  Number(process.env.COURSE_VIDEO_CHUNK_MAX_BYTES) || 24 * 1024 * 1024; // 24MB per chunk

// File filter for assignment uploads (image and pdf)
const fileFilter = (req, file, cb) => {
  const allowedImageTypes = ["image/jpeg", "image/png", "image/gif"];
  const allowedPdfType = ["application/pdf"];
  if (file.fieldname === "image" && allowedImageTypes.includes(file.mimetype)) {
    cb(null, true);
  } else if (file.fieldname === "pdf" && allowedPdfType.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type for ${file.fieldname}. Allowed: ${file.fieldname === "image" ? "JPEG, PNG, GIF" : "PDF"}`), false);
  }
};

// File filter for single image uploads
const imageFileFilter = (req, file, cb) => {
  const allowedImageTypes = ["image/jpeg", "image/png", "image/gif"];
  if (allowedImageTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type for image. Allowed: JPEG, PNG, GIF"), false);
  }
};

// File filter for video uploads (course videos)
const videoFileFilter = (req, file, cb) => {
  const allowedVideoTypes = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"];
  if (allowedVideoTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type for video. Allowed: MP4, WebM, MOV, AVI"), false);
  }
};

// File filter for mixed media uploads (image or video)
const mediaFileFilter = (req, file, cb) => {
  const allowedImageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  const allowedVideoTypes = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"];
  if (allowedImageTypes.includes(file.mimetype) || allowedVideoTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Allowed: JPEG, PNG, GIF, WEBP, MP4, WebM, MOV, AVI"), false);
  }
};

// Storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, "../../../uploads");
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueFilename = `${uuidv4()}${path.extname(file.originalname)}`;
    if (file.fieldname === "image") {
      req.savedImageId = uniqueFilename;
    } else if (file.fieldname === "pdf") {
      req.savedPdfId = uniqueFilename;
    } else if (file.fieldname === "media") {
      req.savedMediaId = uniqueFilename;
    }
    cb(null, uniqueFilename);
  },
});

// Multer for assignment routes (image and pdf)
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
}).fields([
  { name: "image", maxCount: 1 },
  { name: "pdf", maxCount: 1 },
]);

// Multer for single image uploads (blogs, enrollments)a
const uploadSingleImage = multer({
  storage: storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
}).single("image");

// Multer for single video upload (course videos)
const uploadSingleVideo = multer({
  storage: storage,
  fileFilter: videoFileFilter,
  limits: { fileSize: COURSE_VIDEO_MAX_BYTES },
}).single("video");

// Course video upload with optional PDF attachment
const uploadCourseVideoOptionalPdf = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "video") {
      return videoFileFilter(req, file, cb);
    }
    if (file.fieldname === "pdf") {
      return fileFilter(req, file, cb);
    }
    return cb(new Error(`Unexpected field '${file.fieldname}'`), false);
  },
  limits: { fileSize: COURSE_VIDEO_MAX_BYTES },
}).fields([
  { name: "video", maxCount: 1 },
  { name: "pdf", maxCount: 1 },
]);

// Chunked course-video upload: one binary part per request (field name "chunk")
const courseVideoChunkStorage = multer.diskStorage({
  destination(req, file, cb) {
    const uploadId = req.params?.uploadId;
    if (!uploadId || !/^[0-9a-f-]{36}$/i.test(uploadId)) {
      return cb(new Error("Invalid upload session"));
    }
    const dir = path.join(__dirname, "../../../uploads/temp", uploadId);
    if (!fs.existsSync(dir)) {
      return cb(new Error("Upload session not found or expired"));
    }
    cb(null, dir);
  },
  filename(req, file, cb) {
    const raw = req.params?.chunkIndex;
    const idx = Number.parseInt(String(raw), 10);
    if (!Number.isFinite(idx) || idx < 0) {
      return cb(new Error("Invalid chunk index"));
    }
    cb(null, `part_${String(idx).padStart(8, "0")}`);
  },
});

const uploadCourseVideoChunk = multer({
  storage: courseVideoChunkStorage,
  limits: { fileSize: COURSE_VIDEO_CHUNK_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    // Browsers often send application/octet-stream for sliced blobs; accept common video parts.
    const ok =
      !file.mimetype ||
      file.mimetype === "application/octet-stream" ||
      file.mimetype.startsWith("video/") ||
      file.mimetype === "binary/octet-stream";
    if (ok) return cb(null, true);
    return cb(new Error("Invalid chunk payload"), false);
  },
}).single("chunk");

// Multer for teacher info media upload (image/video) - 100MB limit
const uploadSingleMedia = multer({
  storage: storage,
  fileFilter: mediaFileFilter,
  limits: { fileSize: 100 * 1024 * 1024 },
}).single("media");

/** Optional job poster image (image-based job ads); manual posts may omit file */
const uploadJobPosterOptional = multer({
  storage: storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
}).single("posterImage");

/** Student certificate PDF (admin issues to one student) */
const certificatePdfFilter = (req, file, cb) => {
  if (file.mimetype === "application/pdf") {
    cb(null, true);
  } else {
    cb(new Error("Certificate must be a PDF file"), false);
  }
};

const uploadCertificatePdf = multer({
  storage,
  fileFilter: certificatePdfFilter,
  limits: { fileSize: 20 * 1024 * 1024 },
}).single("pdf");

// Multer error handling middleware
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_UNEXPECTED_FILE") {
    const routePath = `${req.baseUrl || ""}${req.route?.path || ""}`;
    const expected = routePath.includes("/courseVideo/chunk/")
      ? "chunk"
      : routePath.includes("/certificates")
        ? "pdf"
        : routePath.includes("/courseVideo")
          ? "video (and optional pdf)"
          : routePath.includes("/submit") || routePath.includes("/updateAssignment")
            ? "image or pdf"
            : "image";
    return res.status(400).json({ message: `Multer error: Unexpected field '${err.field}'. Expected: ${expected}` });
  } else if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: `Multer error: ${err.message}` });
  } else if (err) {
    return res.status(400).json({ message: err.message });
  }
  next();
};

module.exports = {
  upload,
  uploadSingleImage,
  uploadSingleVideo,
  uploadCourseVideoOptionalPdf,
  uploadCourseVideoChunk,
  COURSE_VIDEO_MAX_BYTES,
  COURSE_VIDEO_CHUNK_MAX_BYTES,
  uploadSingleMedia,
  uploadJobPosterOptional,
  uploadCertificatePdf,
  handleMulterError,
};