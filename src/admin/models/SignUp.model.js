const mongoose = require("mongoose");

const signupSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  branch:{type:String},
  password: String,
  phone: String,
  subject: [
    {
      type: String
    }
  ],
  role: {
    type: String,
    enum: ["teacher", "student"],
    default: "student",
    // required: true,
  },
   hasLink: { type: Boolean, default: false },
  /** Admin sets which video language this student sees (Urdu / English / Arabic). */
  videoLanguage: {
    type: String,
    enum: ["Urdu", "English", "Arabic", "Pashto"],
    default: "English",
  },
  // Per-student access control for live class and my-videos.
  videoAccessEnabled: {
    type: Boolean,
    default: true,
  },
  // If false, student cannot stay logged in or login again.
  accountEnabled: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

module.exports = mongoose.model("signup", signupSchema);
