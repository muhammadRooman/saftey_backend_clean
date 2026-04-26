const Signup = require("../models/SignUp.model");
const Setting = require("../models/Setting.model");

const KEY_STUDENT_VIDEO_ENABLED = "studentVideoEnabled";

exports.getStudentVideoSetting = async (req, res) => {
  try {
    const setting = await Setting.findOne({ key: KEY_STUDENT_VIDEO_ENABLED })
      .select("key boolValue")
      .lean();
    const enabled = setting ? !!setting.boolValue : true;
    res.json({ success: true, key: KEY_STUDENT_VIDEO_ENABLED, enabled });
  } catch (err) {
    console.error("getStudentVideoSetting error", err);
    res.status(500).json({ message: "Failed to load setting" });
  }
};

exports.setStudentVideoSetting = async (req, res) => {
  try {
    const actor = await Signup.findById(req.userId).select("role").lean();
    if (!actor || actor.role !== "teacher") {
      return res.status(403).json({ message: "Only admin/teacher can update this setting" });
    }

    const enabled = !!req.body?.enabled;

    const setting = await Setting.findOneAndUpdate(
      { key: KEY_STUDENT_VIDEO_ENABLED },
      { $set: { boolValue: enabled } },
      { upsert: true, new: true }
    ).select("key boolValue").lean();

    res.json({ success: true, key: KEY_STUDENT_VIDEO_ENABLED, enabled: !!setting.boolValue });
  } catch (err) {
    console.error("setStudentVideoSetting error", err);
    res.status(500).json({ message: "Failed to update setting" });
  }
};

exports.isStudentVideoEnabled = async () => {
  const setting = await Setting.findOne({ key: KEY_STUDENT_VIDEO_ENABLED })
    .select("boolValue")
    .lean();
  return setting ? !!setting.boolValue : true;
};

