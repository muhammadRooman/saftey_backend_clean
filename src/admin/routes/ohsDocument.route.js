const express = require("express");
const router = express.Router();
const ohsDocumentController = require("../conrollers/OHSDocument.controller");
const { verifyToken } = require("../middlewares/Auth.middleware");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Configure multer for PDF uploads
const uploadDir = path.join(__dirname, "../../..", "uploads", "documents");

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit for PDFs
  fileFilter: function (req, file, cb) {
    const allowedMimes = ['application/pdf'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// Upload OHS Document (Admin only)
router.post(
  "/upload",
  verifyToken,
  upload.single("document"),
  ohsDocumentController.uploadOHSDocument
);

// Get all OHS Documents (Students & Admin)
router.get("/", ohsDocumentController.getAllOHSDocuments);

// Get single OHS Document
router.get("/:id", ohsDocumentController.getOHSDocument);

// Update OHS Document (Admin only)
router.put(
  "/:id",
  verifyToken,
  upload.single("document"),
  ohsDocumentController.updateOHSDocument
);

// Delete OHS Document (Admin only)
router.delete("/:id", verifyToken, ohsDocumentController.deleteOHSDocument);

// Deactivate OHS Document (Soft delete)
router.patch(
  "/:id/deactivate",
  verifyToken,
  ohsDocumentController.deactivateOHSDocument
);

module.exports = router;
