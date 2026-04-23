const express = require("express");
const router = express.Router();
const studentRegistrationController = require("../conrollers/StudentRegistration.controller");
const { verifyToken } = require("../middlewares/Auth.middleware");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Configure multer for image uploads
const uploadDir = path.join(__dirname, "../../..", "uploads", "registrations");

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
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Create new registration (Students)
router.post(
  "/create",
  upload.single("profileImage"),
  studentRegistrationController.createStudentRegistration
);

// Get all registrations (Admin)
router.get("/all", verifyToken, studentRegistrationController.getAllStudentRegistrations);

// Get single registration
router.get("/:id", verifyToken, studentRegistrationController.getStudentRegistration);

// Get registrations by userId
router.get("/user/:userId", verifyToken, studentRegistrationController.getStudentRegistrationByUser);

// Update registration (Student - edit own)
router.put(
  "/:id",
  verifyToken,
  upload.single("profileImage"),
  studentRegistrationController.updateStudentRegistration
);

// Update status (Admin only)
router.patch(
  "/:id/status",
  verifyToken,
  studentRegistrationController.updateRegistrationStatus
);

// Delete registration (Admin only)
router.delete("/:id", verifyToken, studentRegistrationController.deleteStudentRegistration);

module.exports = router;
