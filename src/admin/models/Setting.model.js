const mongoose = require("mongoose");

const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    boolValue: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.setting || mongoose.model("setting", settingSchema);

