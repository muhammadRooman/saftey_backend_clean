const Signup = require("../models/SignUp.model");
const FeeAccount = require("../models/FeeAccount.model");
const FeePayment = require("../models/FeePayment.model");

const getMonthRange = (monthStr) => {
  // monthStr: "YYYY-MM" (optional)
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth(); // 0-based

  if (monthStr && /^\d{4}-\d{2}$/.test(String(monthStr))) {
    const [yy, mm] = String(monthStr).split("-").map((x) => Number(x));
    if (Number.isFinite(yy) && Number.isFinite(mm) && mm >= 1 && mm <= 12) {
      y = yy;
      m = mm - 1;
    }
  }

  const start = new Date(y, m, 1, 0, 0, 0, 0);
  const end = new Date(y, m + 1, 1, 0, 0, 0, 0);
  return { start, end, year: y, monthIndex: m };
};

const toDateOnly = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

const extractCourseNames = (...sources) => {
  const names = [];

  const addName = (value) => {
    const name = String(value || "").trim();
    if (name) names.push(name);
  };

  const walk = (value) => {
    if (!value) return;

    if (typeof value === "string") {
      const raw = value.trim();
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        walk(parsed);
      } catch {
        addName(raw);
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }

    if (typeof value === "object") {
      if (value.name != null) addName(value.name);
      else if (value.courseName != null) addName(value.courseName);
      else if (value.title != null) addName(value.title);
      return;
    }

    addName(value);
  };

  sources.forEach(walk);
  return Array.from(new Set(names));
};

const requireTeacher = async (req, res) => {
  const actor = await Signup.findById(req.userId).select("role");
  if (!actor || actor.role !== "teacher") {
    res.status(403).json({ message: "Only admin/teacher can access fees" });
    return null;
  }
  return actor;
};

exports.listStudentFeeSummaries = async (req, res) => {
  try {
    const actor = await requireTeacher(req, res);
    if (!actor) return;

    const { start, end } = getMonthRange(req.query.month);

    const students = await Signup.find({ role: "student" })
      .select("_id name email phone branch subject videoAccessEnabled accountEnabled")
      .lean();

    const studentIds = students.map((s) => s._id);

    const accounts = await FeeAccount.find({ student: { $in: studentIds } })
      .select("student totalFee")
      .lean();
    const accountByStudent = new Map(
      accounts.map((a) => [String(a.student), a])
    );

    const paymentsAgg = await FeePayment.aggregate([
      { $match: { student: { $in: studentIds } } },
      {
        $group: {
          _id: "$student",
          paidTotal: { $sum: "$amount" },
        },
      },
    ]);
    const paidTotalByStudent = new Map(
      paymentsAgg.map((p) => [String(p._id), Number(p.paidTotal || 0)])
    );

    const paymentsMonthAgg = await FeePayment.aggregate([
      {
        $match: {
          student: { $in: studentIds },
          paidAt: { $gte: start, $lt: end },
        },
      },
      {
        $group: {
          _id: "$student",
          paidThisMonth: { $sum: "$amount" },
        },
      },
    ]);
    const paidMonthByStudent = new Map(
      paymentsMonthAgg.map((p) => [String(p._id), Number(p.paidThisMonth || 0)])
    );

    const latestPaymentAgg = await FeePayment.aggregate([
      { $match: { student: { $in: studentIds } } },
      {
        $group: {
          _id: "$student",
          lastPaidAt: { $max: "$paidAt" },
        },
      },
    ]);
    const lastPaidAtByStudent = new Map(
      latestPaymentAgg.map((p) => [String(p._id), p.lastPaidAt || null])
    );

    const rows = students.map((s) => {
      const acc = accountByStudent.get(String(s._id));
      const totalFee = Number(acc?.totalFee || 0);
      const paidTotal = Number(paidTotalByStudent.get(String(s._id)) || 0);
      const pending = Math.max(0, totalFee - paidTotal);
      const paidThisMonth = Number(paidMonthByStudent.get(String(s._id)) || 0);

      return {
        studentId: s._id,
        name: s.name || "",
        email: s.email || "",
        phone: s.phone || "",
        branch: s.branch || "",
        assignedCourses: extractCourseNames(
          s.subject,
          s.courses,
          s.course,
          s.assignedCourses
        ),
        videoAccessEnabled: s.videoAccessEnabled !== false,
        accountEnabled: s.accountEnabled !== false,
        totalFee,
        paidTotal,
        pending,
        paidThisMonth,
        lastPaidAt: lastPaidAtByStudent.get(String(s._id)) || null,
        paymentDate: toDateOnly(lastPaidAtByStudent.get(String(s._id))),
      };
    });

    res.json({ success: true, data: rows, monthStart: start, monthEnd: end });
  } catch (err) {
    console.error("listStudentFeeSummaries error", err);
    res.status(500).json({ message: "Failed to load fee summaries" });
  }
};

exports.setStudentVideoAccess = async (req, res) => {
  try {
    const actor = await requireTeacher(req, res);
    if (!actor) return;

    const { studentId } = req.params;
    if (!studentId) return res.status(400).json({ message: "studentId required" });

    const enabled = !!req.body?.enabled;

    const student = await Signup.findOneAndUpdate(
      { _id: studentId, role: "student" },
      { $set: { videoAccessEnabled: enabled } },
      { new: true }
    ).select("_id videoAccessEnabled");

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    res.json({
      success: true,
      data: {
        studentId: student._id,
        videoAccessEnabled: student.videoAccessEnabled !== false,
      },
    });
  } catch (err) {
    console.error("setStudentVideoAccess error", err);
    res.status(500).json({ message: "Failed to update student video access" });
  }
};

exports.setStudentAccountStatus = async (req, res) => {
  try {
    const actor = await requireTeacher(req, res);
    if (!actor) return;

    const { studentId } = req.params;
    if (!studentId) return res.status(400).json({ message: "studentId required" });

    const enabled = !!req.body?.enabled;

    const student = await Signup.findOneAndUpdate(
      { _id: studentId, role: "student" },
      { $set: { accountEnabled: enabled } },
      { new: true }
    ).select("_id accountEnabled");

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    res.json({
      success: true,
      data: {
        studentId: student._id,
        accountEnabled: student.accountEnabled !== false,
      },
    });
  } catch (err) {
    console.error("setStudentAccountStatus error", err);
    res.status(500).json({ message: "Failed to update student account status" });
  }
};

exports.setStudentTotalFee = async (req, res) => {
  try {
    const actor = await requireTeacher(req, res);
    if (!actor) return;

    const { studentId } = req.params;
    const totalFee = Number(req.body?.totalFee);
    if (!studentId) return res.status(400).json({ message: "studentId required" });
    if (!Number.isFinite(totalFee) || totalFee < 0) {
      return res.status(400).json({ message: "totalFee must be a number >= 0" });
    }

    const student = await Signup.findById(studentId).select("_id role");
    if (!student || student.role !== "student") {
      return res.status(404).json({ message: "Student not found" });
    }

    const acc = await FeeAccount.findOneAndUpdate(
      { student: student._id },
      { $set: { totalFee } },
      { upsert: true, new: true }
    ).lean();

    res.json({ success: true, data: acc });
  } catch (err) {
    console.error("setStudentTotalFee error", err);
    res.status(500).json({ message: "Failed to update total fee" });
  }
};

exports.addPayment = async (req, res) => {
  try {
    const actor = await requireTeacher(req, res);
    if (!actor) return;

    const studentId = req.body?.studentId;
    const amount = Number(req.body?.amount);
    const paidAtRaw = req.body?.paidAt;

    if (!studentId) return res.status(400).json({ message: "studentId required" });
    if (!Number.isFinite(amount) || amount === 0) {
      return res.status(400).json({ message: "amount must not be 0" });
    }

    const paidAt = paidAtRaw ? new Date(paidAtRaw) : new Date();
    if (Number.isNaN(paidAt.getTime())) {
      return res.status(400).json({ message: "paidAt is invalid" });
    }

    const student = await Signup.findById(studentId).select("_id role");
    if (!student || student.role !== "student") {
      return res.status(404).json({ message: "Student not found" });
    }

    // Do not allow adjustment that makes total paid negative.
    const paidAgg = await FeePayment.aggregate([
      { $match: { student: student._id } },
      { $group: { _id: "$student", paidTotal: { $sum: "$amount" } } },
    ]);
    const currentPaidTotal = Number(paidAgg?.[0]?.paidTotal || 0);
    if (currentPaidTotal + amount < 0) {
      return res.status(400).json({
        message: "Adjustment exceeds paid amount. Paid total cannot be negative.",
      });
    }

    // ensure account exists
    await FeeAccount.findOneAndUpdate(
      { student: student._id },
      { $setOnInsert: { totalFee: 0 } },
      { upsert: true, new: true }
    );

    const payment = await FeePayment.create({
      student: student._id,
      amount,
      paidAt,
      createdBy: actor._id,
    });

    res.status(201).json({ success: true, data: payment });
  } catch (err) {
    console.error("addPayment error", err);
    res.status(500).json({ message: "Failed to add payment" });
  }
};

exports.getMonthlySummary = async (req, res) => {
  try {
    const actor = await requireTeacher(req, res);
    if (!actor) return;

    const { start, end, year, monthIndex } = getMonthRange(req.query.month);

    const monthRevenueAgg = await FeePayment.aggregate([
      { $match: { paidAt: { $gte: start, $lt: end } } },
      { $group: { _id: null, revenue: { $sum: "$amount" } } },
    ]);
    const monthRevenue = Number(monthRevenueAgg?.[0]?.revenue || 0);

    // global pending = sum(max(0, totalFee - paidTotal))
    const accounts = await FeeAccount.find({}).select("student totalFee").lean();
    const studentIds = accounts.map((a) => a.student);
    const paidAgg = await FeePayment.aggregate([
      { $match: { student: { $in: studentIds } } },
      { $group: { _id: "$student", paidTotal: { $sum: "$amount" } } },
    ]);
    const paidByStudent = new Map(
      paidAgg.map((p) => [String(p._id), Number(p.paidTotal || 0)])
    );

    const totalPending = accounts.reduce((sum, a) => {
      const totalFee = Number(a.totalFee || 0);
      const paidTotal = Number(paidByStudent.get(String(a.student)) || 0);
      return sum + Math.max(0, totalFee - paidTotal);
    }, 0);

    res.json({
      success: true,
      month: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
      monthRevenue,
      totalPending,
    });
  } catch (err) {
    console.error("getMonthlySummary error", err);
    res.status(500).json({ message: "Failed to load monthly summary" });
  }
};