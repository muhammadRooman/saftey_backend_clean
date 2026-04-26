const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { pipeline, finished } = require("stream/promises");
const { v4: uuidv4 } = require("uuid");

const CourseVideo = require("../models/courseVideo.model");
const Signup = require("../models/SignUp.model");
const {
  COURSE_VIDEO_MAX_BYTES,
  COURSE_VIDEO_CHUNK_MAX_BYTES,
} = require("../middlewares/Uploads");

const UPLOADS_ROOT = path.join(__dirname, "../../../uploads");
const TEMP_ROOT = path.join(UPLOADS_ROOT, "temp");

/* =========================
   LANGUAGE SAFE PARSER
========================= */
function parseLanguage(raw) {
  if (!raw) return "English";

  const v = String(raw).trim().toLowerCase();

  const map = {
    urdu: "Urdu",
    english: "English",
    arabic: "Arabic",
    pashto: "Pashto",
  };

  return map[v] || "English";
}

/* =========================
   SAFE FILE EXT
========================= */
function safeVideoExt(fileName) {
  const ext = path.extname(String(fileName || "")).toLowerCase();
  const allowed = [".mp4", ".webm", ".mov", ".avi"];
  return allowed.includes(ext) ? ext : ".mp4";
}

/* =========================
   READ MANIFEST
========================= */
async function readManifest(uploadId) {
  const dir = path.join(TEMP_ROOT, uploadId);
  const raw = await fsp.readFile(path.join(dir, "manifest.json"), "utf8");
  return { dir, manifest: JSON.parse(raw) };
}

/* =========================
   INIT UPLOAD
========================= */
exports.initChunkUpload = async (req, res) => {
  try {
    const {
      fileName,
      totalSize,
      totalChunks,
      title,
      courseType,
      language,
    } = req.body;

    if (!title || !courseType) {
      return res.status(400).json({
        message: "title & courseType required",
      });
    }

    await fsp.mkdir(TEMP_ROOT, { recursive: true });

    const uploadId = uuidv4();
    const dir = path.join(TEMP_ROOT, uploadId);

    await fsp.mkdir(dir, { recursive: true });

    const manifest = {
      teacherId: req.userId,
      fileName: fileName || "video.mp4",
      totalSize: Number(totalSize),
      totalChunks: Number(totalChunks),
      title,
      courseType,
      language: parseLanguage(language),
      fileUrl: "",
      managingMaterialUrl: "",
      createdAt: new Date().toISOString(),
    };

    await fsp.writeFile(
      path.join(dir, "manifest.json"),
      JSON.stringify(manifest),
      "utf8"
    );

    res.status(201).json({
      uploadId,
      message: "Upload session created",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =========================
   RECEIVE CHUNK
========================= */
exports.receiveChunk = async (req, res) => {
  try {
    const { uploadId, chunkIndex } = req.params;

    const file = req.file;

    if (!file) {
      return res.status(400).json({
        message: "chunk missing",
      });
    }

    const { dir } = await readManifest(uploadId);

    const chunkPath = path.join(
      dir,
      `part_${String(chunkIndex).padStart(8, "0")}`
    );

    await fsp.rename(file.path, chunkPath);

    res.json({
      message: "chunk saved",
      chunkIndex,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =========================
   COMPLETE UPLOAD
========================= */
exports.completeChunkUpload = async (req, res) => {
  try {
    const { uploadId } = req.body;

    const { dir, manifest } = await readManifest(uploadId);

    const parts = [];
    let total = 0;

    for (let i = 0; i < manifest.totalChunks; i++) {
      const p = path.join(dir, `part_${String(i).padStart(8, "0")}`);
      const stat = await fsp.stat(p);
      parts.push(p);
      total += stat.size;
    }

    if (total !== manifest.totalSize) {
      return res.status(400).json({
        message: "file corrupted",
      });
    }

    const finalName = `${uuidv4()}${safeVideoExt(manifest.fileName)}`;
    const finalPath = path.join(UPLOADS_ROOT, finalName);

    await fsp.mkdir(UPLOADS_ROOT, { recursive: true });

    const writeStream = fs.createWriteStream(finalPath);

    for (const p of parts) {
      await pipeline(fs.createReadStream(p), writeStream, {
        end: false,
      });
    }

    writeStream.end();
    await finished(writeStream);

    await fsp.rm(dir, { recursive: true, force: true });

    const video = new CourseVideo({
      title: manifest.title,
      courseType: manifest.courseType,
      language: manifest.language,
      videoUrl: finalName,
      fileUrl: manifest.fileUrl || "",
      managingMaterialUrl: manifest.managingMaterialUrl || "",
      teacher: manifest.teacherId,
    });

    await video.save();

    res.status(201).json({
      message: "video uploaded successfully",
      video,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =========================
   SIMPLE UPLOAD
========================= */
exports.uploadVideo = async (req, res) => {
  try {
    const { title, courseType, language } = req.body;

    // Get video file from req.files.video
    const videoFileArray = req.files?.video || [];
    const videoFile = videoFileArray.length > 0 ? videoFileArray[0] : null;

    if (!videoFile) {
      return res.status(400).json({
        message: "video required",
      });
    }

    // Get PDF files
    const pdfFileArray = req.files?.pdf || [];
    const pdfFile = pdfFileArray.length > 0 ? pdfFileArray[0] : null;

    const managingMaterialArray = req.files?.managingMaterial || [];
    const managingMaterialFile = managingMaterialArray.length > 0 ? managingMaterialArray[0] : null;

    const video = new CourseVideo({
      title,
      courseType,
      language: parseLanguage(language),
      videoUrl: videoFile.filename,
      fileUrl: pdfFile ? pdfFile.filename : "",
      managingMaterialUrl: managingMaterialFile ? managingMaterialFile.filename : "",
      teacher: req.userId,
    });

    await video.save();

    res.json({
      message: "uploaded",
      video,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =========================
   GET ALL VIDEOS (ADMIN)
========================= */
exports.getVideos = async (req, res) => {
  try {
    const { courseType, language } = req.query;
    
    // Build filter object
    const filter = {};
    if (courseType) {
      filter.courseType = courseType;
    }
    if (language) {
      filter.language = parseLanguage(language);
    }

    const videos = await CourseVideo.find(filter).sort({
      createdAt: -1,
    });

    res.json(videos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =========================
   UPDATE VIDEO
========================= */
exports.updateVideo = async (req, res) => {
  try {
    const video = await CourseVideo.findById(req.params.id);

    if (!video) {
      return res.status(404).json({
        message: "not found",
      });
    }
    if (req.body.title) video.title = req.body.title;
    if (req.body.courseType) video.courseType = req.body.courseType;
    if (req.body.language) video.language = parseLanguage(req.body.language);

    // Update video file if provided
    const videoFileArray = req.files?.video || [];
    const videoFile = videoFileArray.length > 0 ? videoFileArray[0] : null;
    if (videoFile) video.videoUrl = videoFile.filename;

    // Update PDF file if provided
    const pdfFileArray = req.files?.pdf || [];
    const pdfFile = pdfFileArray.length > 0 ? pdfFileArray[0] : null;
    if (pdfFile) video.fileUrl = pdfFile.filename;

    // Update managing material file if provided
    const managingMaterialArray = req.files?.managingMaterial || [];
    const managingMaterialFile = managingMaterialArray.length > 0 ? managingMaterialArray[0] : null;
    if (managingMaterialFile) video.managingMaterialUrl = managingMaterialFile.filename;

    await video.save();

    res.json({
      message: "updated",
      video,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =========================
   DELETE VIDEO
========================= */
exports.deleteVideo = async (req, res) => {
  try {
    await CourseVideo.findByIdAndDelete(req.params.id);

    res.json({
      message: "deleted",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =========================
   GET STUDENT VIDEOS
========================= */
async function getVideosForStudentId(studentId) {
  const student = await Signup.findById(studentId).select(
    "subject videoLanguage videoAccessEnabled"
  );

  if (!student) {
    return { notFound: true };
  }
  if (student.videoAccessEnabled === false) {
    return { videos: [] };
  }

  const subjects = Array.isArray(student.subject)
    ? student.subject
    : student.subject
    ? [student.subject]
    : [];

  if (subjects.length === 0) {
    return { videos: [] };
  }

  const language = parseLanguage(student.videoLanguage);

  const query =
    language === "English"
      ? {
          courseType: { $in: subjects },
          $or: [
            { language: "English" },
            { language: { $exists: false } },
            { language: null },
          ],
        }
      : {
          courseType: { $in: subjects },
          language,
        };

  const videos = await CourseVideo.find(query).sort({
    createdAt: -1,
  });

  return { videos };
}

/* =========================
   MY VIDEOS / STUDENT VIDEOS
========================= */
exports.getVideosForStudentOrMe = async (req, res) => {
  try {
    const studentId = req.params.studentId || req.userId;

    const result = await getVideosForStudentId(studentId);

    if (result.notFound) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.status(200).json(result.videos);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
};


// const fs = require("fs");
// const fsp = require("fs/promises");
// const path = require("path");
// const { pipeline, finished } = require("stream/promises");
// const { v4: uuidv4 } = require("uuid");

// const CourseVideo = require("../models/courseVideo.model");
// const Signup = require("../models/SignUp.model");
// const {
//   COURSE_VIDEO_MAX_BYTES,
//   COURSE_VIDEO_CHUNK_MAX_BYTES,
// } = require("../middlewares/Uploads");

// const UPLOADS_ROOT = path.join(__dirname, "../../../uploads");
// const TEMP_ROOT = path.join(UPLOADS_ROOT, "temp");

// /* =========================
//    LANGUAGE SAFE PARSER
// ========================= */
// function parseLanguage(raw) {
//   if (!raw) return "English";
//   const v = String(raw).trim().toLowerCase();

//   const map = {
//     urdu: "Urdu",
//     english: "English",
//     arabic: "Arabic",
//     pashto: "Pashto",
//   };

//   return map[v] || "English";
// }

// /* =========================
//    SAFE FILE EXT
// ========================= */
// function safeVideoExt(fileName) {
//   const ext = path.extname(String(fileName || "")).toLowerCase();
//   const allowed = [".mp4", ".webm", ".mov", ".avi"];
//   return allowed.includes(ext) ? ext : ".mp4";
// }

// /* =========================
//    READ MANIFEST
// ========================= */
// async function readManifest(uploadId) {
//   const dir = path.join(TEMP_ROOT, uploadId);
//   const raw = await fsp.readFile(path.join(dir, "manifest.json"), "utf8");
//   return { dir, manifest: JSON.parse(raw) };
// }

// /* =========================
//    INIT UPLOAD
// ========================= */
// exports.initChunkUpload = async (req, res) => {
//   try {
//     const {
//       fileName,
//       totalSize,
//       totalChunks,
//       title,
//       courseType,
//       language,
//     } = req.body;

//     if (!title || !courseType) {
//       return res.status(400).json({ message: "title & courseType required" });
//     }

//     await fsp.mkdir(TEMP_ROOT, { recursive: true });

//     const uploadId = uuidv4();
//     const dir = path.join(TEMP_ROOT, uploadId);
//     await fsp.mkdir(dir, { recursive: true });

//     const manifest = {
//       teacherId: req.userId,
//       fileName: fileName || "video.mp4",
//       totalSize: Number(totalSize),
//       totalChunks: Number(totalChunks),
//       title,
//       courseType, // 🔥 FULLY DYNAMIC (NO ENUM)
//       language: parseLanguage(language),
//       createdAt: new Date().toISOString(),
//     };

//     await fsp.writeFile(
//       path.join(dir, "manifest.json"),
//       JSON.stringify(manifest),
//       "utf8"
//     );

//     res.status(201).json({
//       uploadId,
//       message: "Upload session created",
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// /* =========================
//    RECEIVE CHUNK
// ========================= */
// exports.receiveChunk = async (req, res) => {
//   try {
//     const { uploadId, chunkIndex } = req.params;

//     const file = req.file;
//     if (!file) {
//       return res.status(400).json({ message: "chunk missing" });
//     }

//     const { dir } = await readManifest(uploadId);

//     const chunkPath = path.join(
//       dir,
//       `part_${String(chunkIndex).padStart(8, "0")}`
//     );

//     await fsp.rename(file.path, chunkPath);

//     res.json({ message: "chunk saved", chunkIndex });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// /* =========================
//    COMPLETE UPLOAD
// ========================= */
// exports.completeChunkUpload = async (req, res) => {
//   try {
//     const { uploadId } = req.body;

//     const { dir, manifest } = await readManifest(uploadId);

//     const parts = [];
//     let total = 0;

//     for (let i = 0; i < manifest.totalChunks; i++) {
//       const p = path.join(dir, `part_${String(i).padStart(8, "0")}`);
//       const stat = await fsp.stat(p);
//       parts.push(p);
//       total += stat.size;
//     }

//     if (total !== manifest.totalSize) {
//       return res.status(400).json({ message: "file corrupted" });
//     }

//     const finalName = `${uuidv4()}${safeVideoExt(manifest.fileName)}`;
//     const finalPath = path.join(UPLOADS_ROOT, finalName);

//     await fsp.mkdir(UPLOADS_ROOT, { recursive: true });

//     const writeStream = fs.createWriteStream(finalPath);

//     for (const p of parts) {
//       await pipeline(fs.createReadStream(p), writeStream, {
//         end: false,
//       });
//     }

//     writeStream.end();
//     await finished(writeStream);

//     await fsp.rm(dir, { recursive: true, force: true });

//     const video = new CourseVideo({
//       title: manifest.title,
//       courseType: manifest.courseType, // 🔥 NO RESTRICTION
//       language: manifest.language,
//       videoUrl: finalName,
//       teacher: manifest.teacherId,
//     });

//     await video.save();

//     res.status(201).json({
//       message: "video uploaded successfully",
//       video,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// /* =========================
//    SIMPLE UPLOAD
// ========================= */
// exports.uploadVideo = async (req, res) => {
//   try {
//     const { title, courseType, language } = req.body;

//     const file = req.file || req.files?.video?.[0];

//     if (!file) {
//       return res.status(400).json({ message: "video required" });
//     }

//     const video = new CourseVideo({
//       title,
//       courseType, // 🔥 ANY VALUE ACCEPTED
//       language: parseLanguage(language),
//       videoUrl: file.filename,
//       teacher: req.userId,
//     });

//     await video.save();

//     res.json({
//       message: "uploaded",
//       video,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// /* =========================
//    GET VIDEOS
// ========================= */
// exports.getVideos = async (req, res) => {
//   try {
//     const videos = await CourseVideo.find().sort({ createdAt: -1 });
//     res.json(videos);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// /* =========================
//    UPDATE VIDEO
// ========================= */
// exports.updateVideo = async (req, res) => {
//   try {
//     const video = await CourseVideo.findById(req.params.id);

//     if (!video) {
//       return res.status(404).json({ message: "not found" });
//     }

//     if (req.body.title) video.title = req.body.title;
//     if (req.body.courseType) video.courseType = req.body.courseType; // 🔥 dynamic
//     if (req.body.language) video.language = parseLanguage(req.body.language);

//     const file = req.file || req.files?.video?.[0];
//     if (file) video.videoUrl = file.filename;

//     await video.save();

//     res.json({ message: "updated", video });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// /* =========================
//    DELETE VIDEO
// ========================= */
// exports.deleteVideo = async (req, res) => {
//   try {
//     await CourseVideo.findByIdAndDelete(req.params.id);
//     res.json({ message: "deleted" });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

































// const fs = require("fs");
// const fsp = require("fs/promises");
// const path = require("path");
// const { pipeline, finished } = require("stream/promises");
// const { v4: uuidv4 } = require("uuid");

// const CourseVideo = require("../models/courseVideo.model");
// const Signup = require("../models/SignUp.model");
// const { COURSE_VIDEO_MAX_BYTES, COURSE_VIDEO_CHUNK_MAX_BYTES } = require("../middlewares/Uploads");

// const LANGS = ["Urdu", "English", "Arabic", "Pashto"];

// const UPLOADS_ROOT = path.join(__dirname, "../../../uploads");
// const TEMP_ROOT = path.join(UPLOADS_ROOT, "temp");

// const ALLOWED_VIDEO_EXT = new Set([".mp4", ".webm", ".mov", ".avi"]);

// function safeVideoExt(fileName) {
//   const ext = path.extname(String(fileName || "")).toLowerCase();
//   return ALLOWED_VIDEO_EXT.has(ext) ? ext : ".mp4";
// }

// async function readManifest(uploadId) {
//   const dir = path.join(TEMP_ROOT, uploadId);
//   const raw = await fsp.readFile(path.join(dir, "manifest.json"), "utf8");
//   return { dir, manifest: JSON.parse(raw) };
// }

// /** Start chunked upload: creates temp dir + manifest (validated against max size). */
// exports.initChunkUpload = async (req, res) => {
//   try {
//     const { fileName, totalSize, totalChunks, title, courseType, language, videoLang } = req.body || {};
//     const teacherId = req.userId;

//     if (!title || !courseType) {
//       return res.status(400).json({ message: "Title and courseType are required" });
//     }
//     if (!["NEBOSH", "IOSH", "OSHA", "RIGGER3"].includes(courseType)) {
//       return res.status(400).json({ message: "courseType must be NEBOSH, RIGGER3, IOSH or OSHA" });
//     }

//     const size = Number(totalSize);
//     const chunks = Number(totalChunks);
//     if (!Number.isFinite(size) || size <= 0 || size > COURSE_VIDEO_MAX_BYTES) {
//       return res.status(400).json({
//         message: `totalSize must be between 1 and ${Math.floor(COURSE_VIDEO_MAX_BYTES / (1024 * 1024))} MB`,
//       });
//     }
//     if (!Number.isFinite(chunks) || chunks < 1 || chunks > 20000) {
//       return res.status(400).json({ message: "totalChunks must be between 1 and 20000" });
//     }

//     const expectedMinChunks = Math.ceil(size / COURSE_VIDEO_CHUNK_MAX_BYTES);
//     if (chunks < expectedMinChunks) {
//       return res.status(400).json({
//         message: `totalChunks is too small for this file size (need at least ${expectedMinChunks} chunks for the configured max chunk size)`,
//       });
//     }

//     const langResolved = parseLanguage(language ?? videoLang ?? req.query.language);

//     await fsp.mkdir(TEMP_ROOT, { recursive: true });
//     const uploadId = uuidv4();
//     const dir = path.join(TEMP_ROOT, uploadId);
//     await fsp.mkdir(dir, { recursive: true });

//     const manifest = {
//       teacherId: String(teacherId),
//       fileName: String(fileName || "video.mp4"),
//       totalSize: size,
//       totalChunks: chunks,
//       title: String(title),
//       courseType,
//       language: langResolved,
//       createdAt: new Date().toISOString(),
//     };
//     await fsp.writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest), "utf8");

//     res.status(201).json({
//       uploadId,
//       maxChunkBytes: COURSE_VIDEO_CHUNK_MAX_BYTES,
//       message: "Upload session created. POST each chunk to /courseVideo/chunk/:uploadId/:chunkIndex",
//     });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// };

// /** Receive one chunk (binary field "chunk"). */
// exports.receiveChunk = async (req, res) => {
//   try {
//     const { uploadId, chunkIndex } = req.params;
//     const idx = Number.parseInt(String(chunkIndex), 10);
//     if (!/^[0-9a-f-]{36}$/i.test(uploadId) || !Number.isFinite(idx) || idx < 0) {
//       return res.status(400).json({ message: "Invalid uploadId or chunkIndex" });
//     }

//     let dir;
//     let manifest;
//     try {
//       ({ dir, manifest } = await readManifest(uploadId));
//     } catch {
//       return res.status(404).json({ message: "Upload session not found" });
//     }

//     if (String(manifest.teacherId) !== String(req.userId)) {
//       if (req.file?.path) await fsp.unlink(req.file.path).catch(() => {});
//       return res.status(403).json({ message: "Not allowed for this upload session" });
//     }
//     if (idx >= manifest.totalChunks) {
//       if (req.file?.path) await fsp.unlink(req.file.path).catch(() => {});
//       return res.status(400).json({ message: "chunkIndex out of range" });
//     }

//     const f = req.file;
//     if (!f || !f.path) {
//       return res.status(400).json({ message: "Chunk file is required (field name: chunk)" });
//     }

//     res.status(200).json({ ok: true, chunkIndex: idx, receivedBytes: f.size });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// };

// /** Merge chunks into uploads/ and create CourseVideo document. */
// exports.completeChunkUpload = async (req, res) => {
//   try {
//     const { uploadId } = req.body || {};
//     if (!uploadId || !/^[0-9a-f-]{36}$/i.test(String(uploadId))) {
//       return res.status(400).json({ message: "uploadId is required" });
//     }

//     let dir;
//     let manifest;
//     try {
//       ({ dir, manifest } = await readManifest(uploadId));
//     } catch {
//       return res.status(404).json({ message: "Upload session not found" });
//     }

//     if (String(manifest.teacherId) !== String(req.userId)) {
//       return res.status(403).json({ message: "Not allowed for this upload session" });
//     }

//     const { totalChunks, totalSize, title, courseType, language } = manifest;
//     let sum = 0;
//     const partPaths = [];
//     for (let i = 0; i < totalChunks; i++) {
//       const name = `part_${String(i).padStart(8, "0")}`;
//       const p = path.join(dir, name);
//       try {
//         const st = await fsp.stat(p);
//         partPaths.push(p);
//         sum += st.size;
//       } catch {
//         return res.status(400).json({ message: `Missing chunk ${i}. Upload all parts before completing.` });
//       }
//     }

//     if (sum !== totalSize) {
//       return res.status(400).json({
//         message: `Chunk size mismatch (expected ${totalSize} bytes, got ${sum}). Re-upload missing or corrupted parts.`,
//       });
//     }

//     const ext = safeVideoExt(manifest.fileName);
//     const finalName = `${uuidv4()}${ext}`;
//     const finalPath = path.join(UPLOADS_ROOT, finalName);
//     await fsp.mkdir(UPLOADS_ROOT, { recursive: true });

//     const writeStream = fs.createWriteStream(finalPath);
//     try {
//       for (let i = 0; i < partPaths.length; i++) {
//         await pipeline(fs.createReadStream(partPaths[i]), writeStream, { end: false });
//       }
//       writeStream.end();
//       await finished(writeStream);
//     } catch (e) {
//       try {
//         writeStream.destroy();
//       } catch {}
//       try {
//         await fsp.unlink(finalPath);
//       } catch {}
//       throw e;
//     }

//     await fsp.rm(dir, { recursive: true, force: true });

//     const video = new CourseVideo({
//       title,
//       courseType,
//       language: language || "English",
//       videoUrl: finalName,
//       fileUrl: "",
//       teacher: req.userId,
//     });
//     try {
//       await video.save();
//     } catch (saveErr) {
//       await fsp.unlink(finalPath).catch(() => {});
//       throw saveErr;
//     }

//     res.status(201).json({
//       message: "Video uploaded successfully",
//       video: {
//         _id: video._id,
//         title: video.title,
//         courseType: video.courseType,
//         language: video.language,
//         videoUrl: video.videoUrl,
//         fileUrl: video.fileUrl,
//       },
//     });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// };

// /**
//  * List videos from MongoDB directly + attach teachers.
//  * Avoids Mongoose hydrating with a stale cached schema that omits `language` in JSON even when stored in DB.
//  */
// async function listVideosFromDb(match) {
//   const coll = CourseVideo.collection;
//   const rows = await coll.find(match).sort({ createdAt: -1 }).toArray();
//   const teacherIdStrings = [...new Set(rows.map((r) => r.teacher && String(r.teacher)))];
//   let teacherById = {};
//   if (teacherIdStrings.length) {
//     const teachers = await Signup.find({ _id: { $in: teacherIdStrings } })
//       .select("name email")
//       .lean();
//     teacherById = Object.fromEntries(
//       teachers.map((t) => [String(t._id), { _id: t._id, name: t.name, email: t.email }])
//     );
//   }
//   return rows.map((r) => ({
//     _id: r._id,
//     title: r.title,
//     courseType: r.courseType,
//     videoUrl: r.videoUrl,
//     fileUrl: r.fileUrl || "",
//     language: r.language != null && r.language !== "" ? r.language : "English",
//     teacher: teacherById[String(r.teacher)] || r.teacher,
//     createdAt: r.createdAt,
//     updatedAt: r.updatedAt,
//     __v: r.__v,
//   }));
// }

// /** Normalize language from multipart body or query (trim, case-insensitive). */
// function parseLanguage(raw) {
//   let v = raw;
//   if (Array.isArray(v)) v = v[0];
//   if (v == null || v === "") return "English";
//   const s = String(v).trim();
//   if (!s) return "English";
//   const lower = s.toLowerCase();
//   const map = { urdu: "Urdu", english: "English", arabic: "Arabic", pashto: "Pashto" };
//   if (map[lower]) return map[lower];
//   return LANGS.includes(s) ? s : "English";
// }

// /** Match videos for a student's assigned language; legacy docs without `language` count as English. */
// function buildLanguageQuery(lang) {
//   const l = parseLanguage(lang);
//   if (l === "English") {
//     return {
//       $or: [{ language: "English" }, { language: { $exists: false } }, { language: null }],
//     };
//   }
//   return { language: l };
// }

// async function getVideosForStudentId(studentId) {
//   const student = await Signup.findById(studentId).select("subject videoLanguage");
//   if (!student) {
//     return { notFound: true };
//   }

//   const courseTypes = Array.isArray(student.subject)
//     ? student.subject
//     : (student.subject ? [student.subject] : []);

//   if (courseTypes.length === 0) {
//     return { videos: [] };
//   }

//   const lang = parseLanguage(student.videoLanguage);
//   const videos = await listVideosFromDb({
//     courseType: { $in: courseTypes },
//     ...buildLanguageQuery(lang),
//   });

//   return { videos };
// }

// // One handler for both:
// // - /courseVideo/my-videos        (req.userId)
// // - /courseVideo/student/:id     (req.params.studentId)
// exports.getVideosForStudentOrMe = async (req, res) => {
//   try {
//     const studentId = req.params.studentId || req.userId;
//     const isParamStudent = Boolean(req.params.studentId);

//     const result = await getVideosForStudentId(studentId);

//     if (result.notFound) {
//       return res.status(404).json({
//         message: isParamStudent ? "Student not found" : "User not found",
//       });
//     }

//     res.status(200).json(result.videos);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// };
// // Teacher: upload course video (NEBOSH / IOSH / OSHA)
// exports.uploadVideo = async (req, res) => {
//   try {
//     const { title, courseType, language, videoLang } = req.body;
//     const teacherId = req.userId;

//     if (!title || !courseType) {
//       return res.status(400).json({ message: "Title and courseType are required" });
//     }
//     if (!["NEBOSH", "IOSH", "OSHA", "RIGGER3"].includes(courseType)) {
//       return res.status(400).json({ message: "courseType must be NEBOSH, RIGGER3, IOSH or OSHA" });
//     }
//     // Support both: old `.single("video")` and new `.fields([{name:'video'},{name:'pdf'}])`
//     const videoFile = req.files?.video?.[0] || req.file;
//     const pdfFile = req.files?.pdf?.[0] || null;

//     if (!videoFile || !videoFile.filename) {
//       return res.status(400).json({ message: "Video file is required" });
//     }

//     // Body fields sometimes missing with multipart; also accept query (?language=) and alias videoLang
//     const langRaw = language ?? videoLang ?? req.query.language;
//     const langResolved = parseLanguage(langRaw);

//     const video = new CourseVideo({
//       title,
//       courseType,
//       language: langResolved,
//       videoUrl: videoFile.filename,
//       fileUrl: pdfFile?.filename || "",
//       teacher: teacherId,
//     });
//     await video.save();

//     res.status(201).json({
//       message: "Video uploaded successfully",
//       video: {
//         _id: video._id,
//         title: video.title,
//         courseType: video.courseType,
//         language: video.language,
//         videoUrl: video.videoUrl,
//         fileUrl: video.fileUrl,
//       },
//     });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// };

// // List all videos (teacher) - optional filter by courseType
// exports.getVideos = async (req, res) => {
//   try {
//     const { courseType, language } = req.query;
//     const filter = {};
//     if (courseType && ["NEBOSH", "IOSH", "OSHA", "RIGGER3"].includes(courseType)) {
//       filter.courseType = courseType;
//     }
//     if (language != null && String(language).trim() !== "") {
//       Object.assign(filter, buildLanguageQuery(language));
//     }
//     const videos = await listVideosFromDb(filter);
//     res.status(200).json(videos);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// };
// exports.updateVideo = async (req, res) => {
//   try {
//     const { id } = req.params; // video ID
//     const { title, courseType, language, videoLang } = req.body;

//     if (!id) return res.status(400).json({ message: "Video ID is required" });

//     // Validate courseType if provided
//     if (courseType && !["NEBOSH", "IOSH", "OSHA", "RIGGER3"].includes(courseType)) {
//       return res.status(400).json({ message: "courseType must be NEBOSH, RIGGER3, IOSH or OSHA" });
//     }

//     const video = await CourseVideo.findById(id);
//     if (!video) return res.status(404).json({ message: "Video not found" });

//     // Update fields if provided
//     if (title) video.title = title;
//     if (courseType) video.courseType = courseType;
//     const langRaw = language ?? videoLang ?? req.query.language;
//     if (langRaw != null && String(langRaw).trim() !== "") {
//       video.language = parseLanguage(langRaw);
//     }

//     // If new video file is uploaded
//     const videoFile = req.files?.video?.[0] || req.file;
//     const pdfFile = req.files?.pdf?.[0] || null;

//     if (videoFile && videoFile.filename) {
//       video.videoUrl = videoFile.filename;
//     }

//     // Optional course attachment (PDF). If missing, keep the previous one.
//     if (pdfFile && pdfFile.filename) {
//       video.fileUrl = pdfFile.filename;
//     }

//     await video.save();

//     res.status(200).json({
//       message: "Video updated successfully",
//       video: {
//         _id: video._id,
//         title: video.title,
//         courseType: video.courseType,
//         language: video.language,
//         videoUrl: video.videoUrl,
//         fileUrl: video.fileUrl,
//       },
//     });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// };

// // Backward compatible exports (routes can point to one handler too).
// exports.getVideosForStudent = async (req, res) => exports.getVideosForStudentOrMe(req, res);
// exports.getMyVideos = async (req, res) => exports.getVideosForStudentOrMe(req, res);

// // Delete video (teacher who uploaded or admin)
// exports.deleteVideo = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const video = await CourseVideo.findById(id);
//     if (!video) {
//       return res.status(404).json({ message: "Video not found" });
//     }
//     await CourseVideo.findByIdAndDelete(id);
//     res.status(200).json({ message: "Video deleted successfully" });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// };
