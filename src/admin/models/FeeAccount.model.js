const mongoose = require("mongoose");

const feeAccountSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "signup",
      required: true,
      unique: true,
      index: true,
    },
    totalFee: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.feeAccount || mongoose.model("feeAccount", feeAccountSchema);

