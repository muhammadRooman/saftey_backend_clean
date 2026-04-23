const StudentRegistration = require("../models/StudentRegistration.model");
const Signup = require("../models/SignUp.model");

// Create new student registration
exports.createStudentRegistration = async (req, res) => {
  try {
    const { name, email, courseName,phone, language, userId } = req.body;
    const profileImage = req.file ? req.file.filename : null;

    // Check if email already registered
    const existingRegistration = await StudentRegistration.findOne({ email });
    if (existingRegistration) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const newRegistration = new StudentRegistration({
      name,
      email,
      courseName,
      phone,
      language,
      profileImage,
      status: "pending",
      user: userId || null,
    });

    await newRegistration.save();

    res.status(201).json({
      message: "Registration submitted successfully. Status: Pending. Admin will contact you soon.",
      registration: newRegistration,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get all student registrations (Admin)
exports.getAllStudentRegistrations = async (req, res) => {
  try {
    const registrations = await StudentRegistration.find().populate("user", "name email");
    res.status(200).json({
      message: "Student registrations retrieved successfully",
      registrations,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get single student registration
exports.getStudentRegistration = async (req, res) => {
  try {
    const { id } = req.params;
    const registration = await StudentRegistration.findById(id).populate("user", "name email");

    if (!registration) {
      return res.status(404).json({ message: "Registration not found" });
    }

    res.status(200).json({
      message: "Registration retrieved successfully",
      registration,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update student registration (Student can edit own)
exports.updateStudentRegistration = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, courseName, phone, language } = req.body;
    const profileImage = req.file ? req.file.filename : undefined;

    const updateData = {
      name,
      email,
      courseName,
      phone,
      language,
    };

    // Only update image if a new one is provided
    if (profileImage) {
      updateData.profileImage = profileImage;
    }

    const updatedRegistration = await StudentRegistration.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedRegistration) {
      return res.status(404).json({ message: "Registration not found" });
    }

    res.status(200).json({
      message: "Registration updated successfully",
      registration: updatedRegistration,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update registration status (Admin only)
exports.updateRegistrationStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["pending", "approved"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const updatedRegistration = await StudentRegistration.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!updatedRegistration) {
      return res.status(404).json({ message: "Registration not found" });
    }

    res.status(200).json({
      message: `Registration status updated to ${status}`,
      registration: updatedRegistration,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete student registration (Admin only)
exports.deleteStudentRegistration = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedRegistration = await StudentRegistration.findByIdAndDelete(id);

    if (!deletedRegistration) {
      return res.status(404).json({ message: "Registration not found" });
    }

    res.status(200).json({
      message: "Registration deleted successfully",
      registration: deletedRegistration,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get registrations by userId (Student's own registrations)
exports.getStudentRegistrationByUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const registrations = await StudentRegistration.find({ user: userId });

    res.status(200).json({
      message: "Student registrations retrieved successfully",
      registrations,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
