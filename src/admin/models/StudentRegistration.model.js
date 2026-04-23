const mongoose = require("mongoose");

const studentRegistrationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    courseName: {
      type: String,
      required: true,
    },
    phone: {
      type: Number,
      required: true,
    },
    language: {
      type: String,
      enum: ["English", "Pashto", "Urdu"],
      required: true,
    },
    profileImage: {
      type: String,
      required: false,
    },
    status: {
      type: String,
      enum: ["pending", "approved"],
      default: "pending",
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "signup",
      required: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("StudentRegistration", studentRegistrationSchema);
