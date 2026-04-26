const mongoose = require("mongoose");

const feePaymentSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "signup",
      required: true,
      index: true,
    },
    amount: { type: Number, required: true },
    paidAt: { type: Date, default: Date.now, index: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "signup",
      required: false,
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.feePayment || mongoose.model("feePayment", feePaymentSchema);

