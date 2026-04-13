const express = require("express");
const router = express.Router();

// Import sub-routes
const signUpRoutes = require("./user.route");
const blogsRoutes = require("./blogs.route");
const messageRoutes = require("./message.route");




// Route grouping (certificates are mounted in server.js at /api/admin/certificates)
router.use("/auth", signUpRoutes); // e.g., /api/auth/signup
router.use("/admin", blogsRoutes);
router.use("/messages", messageRoutes);




module.exports = router;
