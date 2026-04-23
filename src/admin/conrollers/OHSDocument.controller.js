const OHSDocument = require("../models/OHSDocument.model");
const path = require("path");
const fs = require("fs");

// Upload OHS Document (Admin only)
exports.uploadOHSDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const { title, description } = req.body;

    if (!title || !title.trim()) {
      // Delete uploaded file if title is missing
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ message: "Title is required" });
    }

    const newDocument = new OHSDocument({
      title: title.trim(),
      description: description ? description.trim() : "",
      fileName: req.file.filename,
      fileSize: req.file.size,
      uploadedBy: req.userId,
      isActive: true,
    });

    await newDocument.save();

    res.status(201).json({
      message: "OHS Document uploaded successfully",
      document: newDocument,
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file) {
      fs.unlink(req.file.path, () => {});
    }
    res.status(500).json({ error: error.message });
  }
};

// Get all OHS Documents (for students and admin)
exports.getAllOHSDocuments = async (req, res) => {
  try {
    const documents = await OHSDocument.find({ isActive: true })
      .populate("uploadedBy", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      message: "OHS Documents retrieved successfully",
      documents,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get single OHS Document by ID
exports.getOHSDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const document = await OHSDocument.findById(id).populate("uploadedBy", "name email");

    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    res.status(200).json({
      message: "Document retrieved successfully",
      document,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update OHS Document (Admin only)
exports.updateOHSDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, isActive } = req.body;

    const updateData = {};
    if (title) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (isActive !== undefined) updateData.isActive = isActive;

    // Handle file replacement
    if (req.file) {
      // Get old document to delete old file
      const oldDoc = await OHSDocument.findById(id);
      if (oldDoc && oldDoc.fileName) {
        const oldFilePath = path.join(
          __dirname,
          "../../../uploads/documents",
          oldDoc.fileName
        );
        fs.unlink(oldFilePath, () => {});
      }

      updateData.fileName = req.file.filename;
      updateData.fileSize = req.file.size;
    }

    const updatedDocument = await OHSDocument.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }).populate("uploadedBy", "name email");

    if (!updatedDocument) {
      return res.status(404).json({ message: "Document not found" });
    }

    res.status(200).json({
      message: "Document updated successfully",
      document: updatedDocument,
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file) {
      fs.unlink(req.file.path, () => {});
    }
    res.status(500).json({ error: error.message });
  }
};

// Delete OHS Document (Admin only)
exports.deleteOHSDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const document = await OHSDocument.findById(id);

    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    // Delete file from server
    const filePath = path.join(
      __dirname,
      "../../../uploads/documents",
      document.fileName
    );
    fs.unlink(filePath, () => {});

    await OHSDocument.findByIdAndDelete(id);

    res.status(200).json({
      message: "Document deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Soft delete (deactivate) OHS Document
exports.deactivateOHSDocument = async (req, res) => {
  try {
    const { id } = req.params;

    const document = await OHSDocument.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    ).populate("uploadedBy", "name email");

    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    res.status(200).json({
      message: "Document deactivated successfully",
      document,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
