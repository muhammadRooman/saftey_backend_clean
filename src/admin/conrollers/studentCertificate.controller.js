const path = require("path");
const fsp = require("fs/promises");

const Signup = require("../models/SignUp.model");
const StudentCertificate = require("../models/studentCertificate.model");

const UPLOADS_DIR = path.join(__dirname, "../../../uploads");

async function loadActor(req) {
  return Signup.findById(req.userId).select("role name email");
}

exports.create = async (req, res) => {
  try {
    const actor = await loadActor(req);
    if (!actor || actor.role !== "teacher") {
      return res.status(403).json({ message: "Only teachers can issue certificates" });
    }

    const { title, description, studentId } = req.body;
    if (!title || !String(title).trim()) {
      return res.status(400).json({ message: "Title is required" });
    }
    if (!studentId) {
      return res.status(400).json({ message: "Student is required" });
    }

    const student = await Signup.findById(studentId).select("role");
    if (!student || student.role !== "student") {
      return res.status(400).json({ message: "Invalid student selected" });
    }

    const file = req.file;
    if (!file?.filename) {
      return res.status(400).json({ message: "PDF certificate file is required" });
    }

    const doc = await StudentCertificate.create({
      title: String(title).trim(),
      description: description != null ? String(description).trim() : "",
      pdfUrl: file.filename,
      student: studentId,
      issuedBy: req.userId,
    });

    const populated = await StudentCertificate.findById(doc._id)
      .populate("student", "name email")
      .lean();

    res.status(201).json({ message: "Certificate issued successfully", certificate: populated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** Teacher: all issued certificates */
exports.listTeacher = async (req, res) => {
  try {
    const actor = await loadActor(req);
    if (!actor || actor.role !== "teacher") {
      return res.status(403).json({ message: "Only teachers can view this list" });
    }

    const rows = await StudentCertificate.find()
      .populate("student", "name email")
      .populate("issuedBy", "name email")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** Student: certificates assigned to them */
exports.listMine = async (req, res) => {
  try {
    const actor = await loadActor(req);
    if (!actor || actor.role !== "student") {
      return res.status(403).json({ message: "Only students can view their certificates here" });
    }

    const rows = await StudentCertificate.find({ student: req.userId })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** Teacher: delete issued certificate + PDF file */
exports.remove = async (req, res) => {
  try {
    const actor = await loadActor(req);
    if (!actor || actor.role !== "teacher") {
      return res.status(403).json({ message: "Only teachers can delete certificates" });
    }

    const doc = await StudentCertificate.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ message: "Certificate not found" });
    }

    const filePath = path.join(UPLOADS_DIR, doc.pdfUrl);
    try {
      await fsp.unlink(filePath);
    } catch {
      // file may already be missing
    }

    await StudentCertificate.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Certificate removed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
