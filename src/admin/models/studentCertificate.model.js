const mongoose = require("mongoose");

const studentCertificateSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    pdfUrl: { type: String, required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "signup", required: true },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: "signup", required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("studentCertificate", studentCertificateSchema);
