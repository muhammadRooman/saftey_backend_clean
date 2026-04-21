const OhsCourseConfig = require("../models/ohsCourseConfig.model");
const Signup = require("../models/SignUp.model");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ====================== MULTER SETUP ======================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = "uploads/courses/";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `course-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files allowed"), false);
  }
});

// ====================== DEFAULTS ======================
const DEFAULT_DESCRIPTION = "This course is designed to enhance your skills and knowledge in occupational health & safety.";
const DEFAULT_CONTACT = {
  name: "OHS Academy",
  email: "ohsacademy1@gmail.com",
  phone: "03429090753",
  address: "Main bazar sher ghar khattak plaza top floor peshawar",
};

const migrateCourses = (coursesInput) => {
  if (!coursesInput) return [];
  if (!Array.isArray(coursesInput)) return [];

  return coursesInput
    .map(item => {
      if (typeof item === "string") {
        return { name: item.trim(), image: "" };
      }
      if (item && typeof item === "object" && item.name) {
        return {
          name: String(item.name).trim(),
          image: item.image || ""
        };
      }
      return null;
    })
    .filter(Boolean);
};

const toResponsePayload = (doc) => {
  const raw = doc?.toObject ? doc.toObject() : (doc || {});
  return {
    description: raw.description || DEFAULT_DESCRIPTION,
    courses: migrateCourses(raw.courses),
    name: raw.name || DEFAULT_CONTACT.name,
    email: raw.email || DEFAULT_CONTACT.email,
    phone: raw.phone || DEFAULT_CONTACT.phone,
    address: raw.address || DEFAULT_CONTACT.address,
  };
};

const getRole = async (userId) => {
  if (!userId) return null;
  const user = await Signup.findById(userId).select("role");
  return user?.role || null;
};

// ====================== GET ======================
exports.getOhsCourses = async (req, res) => {
  try {
    let doc = await OhsCourseConfig.findOne({});
    if (!doc) {
      doc = await OhsCourseConfig.create({
        description: DEFAULT_DESCRIPTION,
        courses: [],
        ...DEFAULT_CONTACT
      });
    }
    return res.status(200).json(toResponsePayload(doc));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to fetch OHS courses" });
  }
};

// ====================== UPDATE ======================
exports.updateOhsCourses = async (req, res) => {
  try {
    const role = await getRole(req.userId);
    if (role !== "teacher") {
      return res.status(403).json({ message: "Only teacher can update OHS courses" });
    }
console.log("req.body",req.body)
    const { description, courses: coursesJson, name, email, phone, address, imageIndex } = req.body;
    const courseImage = req.file;

    const updates = {};

    if (description !== undefined) {
      const desc = String(description).trim();
      if (desc) updates.description = desc;
    }

    if (coursesJson !== undefined && coursesJson !== null) {
      let parsedCourses = [];
      try {
        parsedCourses = typeof coursesJson === "string" 
          ? JSON.parse(coursesJson) 
          : coursesJson;
      } catch (e) {
        return res.status(400).json({ message: "Invalid courses JSON format" });
      }

      updates.courses = migrateCourses(parsedCourses);

      // Assign image if uploaded
      if (courseImage && imageIndex !== undefined) {
        const idx = parseInt(imageIndex);
        if (updates.courses[idx]) {
          updates.courses[idx].image = `/uploads/courses/${courseImage.filename}`;
        }
      }
    }

    if (name !== undefined) {
      const n = String(name).trim();
      if (n) updates.name = n;
    }
    if (email !== undefined) {
      const e = String(email).trim();
      if (e) updates.email = e;
    }
    if (phone !== undefined) {
      const p = String(phone).trim();
      if (p) updates.phone = p;
    }
    if (address !== undefined) {
      const a = String(address).trim();
      if (a) updates.address = a;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "Provide at least one field to update" });
    }

    let doc = await OhsCourseConfig.findOne({});
    if (!doc) {
      doc = new OhsCourseConfig({ courses: [], ...DEFAULT_CONTACT });
    }

    Object.assign(doc, updates);
    await doc.save();

    return res.status(200).json(toResponsePayload(doc));

  } catch (error) {
    console.error("updateOhsCourses Error:", error);
    return res.status(500).json({ 
      message: "Failed to update OHS courses", 
      error: error.message 
    });
  }
};

exports.upload = upload;   // Export multer for route