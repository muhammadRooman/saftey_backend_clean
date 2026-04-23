const express = require("express");
const router = express.Router();

// Import sub-routes
const signUpRoutes = require("./user.route");
const blogsRoutes = require("./blogs.route");
const messageRoutes = require("./message.route");
const studentRegistrationRoutes = require("./studentRegistration.route");
const ohsDocumentRoutes = require("./ohsDocument.route");




// Route grouping (certificates are mounted in server.js at /api/admin/certificates)
router.use("/auth", signUpRoutes); // e.g., /api/auth/signup
router.use("/admin", blogsRoutes);
router.use("/messages", messageRoutes);
router.use("/student-registrations", studentRegistrationRoutes);
router.use("/ohs-documents", ohsDocumentRoutes);




module.exports = router;
