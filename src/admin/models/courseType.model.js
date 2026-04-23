const mongoose = require("mongoose");

const courseTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    label: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Ensure default course types exist on model load
const initializeDefaultCourseTypes = async () => {
  try {
    const CourseType = mongoose.model("courseType", courseTypeSchema);
    const count = await CourseType.countDocuments();

    if (count === 0) {
      const defaultTypes = [
        { name: "NEBOSH", label: "NEBOSH" },
        { name: "IOSH", label: "IOSH" },
        { name: "OSHA", label: "OSHA" },
        { name: "RIGGER3", label: "RIGGER3" },
        { name: "ISO Safety", label: "ISO Safety" },
        { name: "AD Safety", label: "AD Safety" },
        { name: "First Aid", label: "First Aid" },
        { name: "Fire Safety", label: "Fire Safety" },
        { name: "Landcruiser", label: "Landcruiser" },
      ];
      await CourseType.insertMany(defaultTypes);
      console.log("✅ Default course types initialized");
    }
  } catch (err) {
    console.error("Error initializing default course types:", err.message);
  }
};

try {
  mongoose.deleteModel("courseType");
} catch (_) {
  /* not registered yet */
}

const CourseType = mongoose.model("courseType", courseTypeSchema);

// Initialize default types
initializeDefaultCourseTypes();

module.exports = CourseType;
