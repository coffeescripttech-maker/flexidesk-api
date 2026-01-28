// controllers/owner/listings.controller.js
const Listing = require("../../models/Listing");
const User = require("../../models/User");
const cloudinary = require("../../utils/cloudinary");
const { signJwt } = require("../../utils/jwt");
const PolicyManager = require("../../services/PolicyManager");

exports.create = async (req, res) => {
  try {
    const user = await User.findById(req.user.uid);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    let upgradedToken = null;
    if (user.role === "client") {
      user.role = "owner";
      await user.save();
      upgradedToken = signJwt({ uid: user.id, email: user.email, role: user.role });
    }

    const listing = await Listing.create({
      owner: user._id,
      ...req.body,
      status: "draft",
    });

    res.json({
      id: String(listing._id),
      ...(upgradedToken ? { token: upgradedToken } : {}),
    });
  } catch (e) {
    res.status(500).json({ message: e.message || "Create failed" });
  }
};

exports.listMine = async (req, res) => {
  try {
    const { status, limit = 12, cursor } = req.query;
    const q = { owner: req.user.uid };
    if (status) q.status = status;

    const pageSize = Math.min(Number(limit) || 12, 50);
    const find = Listing.find(q).sort({ updatedAt: -1, _id: -1 }).limit(pageSize + 1);
    if (cursor) find.where({ _id: { $lt: cursor } });

    const docs = await find.lean();
    const hasMore = docs.length > pageSize;
    if (hasMore) docs.pop();

    res.json({
      items: docs.map((d) => ({ id: String(d._id), ...d })),
      nextCursor: hasMore ? String(docs[docs.length - 1]._id) : null,
    });
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to load listings" });
  }
};

exports.getById = async (req, res) => {
  try {
    const doc = await Listing.findOne({ _id: req.params.id, owner: req.user.uid }).lean();
    if (!doc) return res.status(404).json({ message: "Not found" });
    res.json({ listing: { id: String(doc._id), ...doc } });
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to load listing" });
  }
};

exports.update = async (req, res) => {
  try {
    const fields = { ...req.body, updatedAt: new Date() };
    delete fields._id;
    delete fields.owner;

    const doc = await Listing.findOneAndUpdate(
      { _id: req.params.id, owner: req.user.uid },
      { $set: fields },
      { new: true }
    ).lean();

    if (!doc) return res.status(404).json({ message: "Not found" });
    res.json({ listing: { id: String(doc._id), ...doc } });
  } catch (e) {
    res.status(500).json({ message: e.message || "Update failed" });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!["draft", "active", "archived"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const doc = await Listing.findOneAndUpdate(
      { _id: req.params.id, owner: req.user.uid },
      { $set: { status } },
      { new: true }
    ).lean();

    if (!doc) return res.status(404).json({ message: "Not found" });
    res.json({ status: doc.status, updatedAt: doc.updatedAt });
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to update status" });
  }
};

exports.remove = async (req, res) => {
  try {
    const doc = await Listing.findOneAndDelete({ _id: req.params.id, owner: req.user.uid }).lean();
    if (!doc) return res.status(404).json({ message: "Not found" });
    
    // Clean up photos from cloudinary
    if (Array.isArray(doc.photosMeta)) {
      for (const photo of doc.photosMeta) {
        if (photo.publicId) {
          try {
            await cloudinary.uploader.destroy(photo.publicId);
          } catch (e) {
            console.error("Failed to delete photo from cloudinary:", e);
          }
        }
      }
    }
    
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message || "Delete failed" });
  }
};

exports.uploadPhotos = async (req, res) => {
  try {
    const listing = await Listing.findOne({ _id: req.params.id, owner: req.user.uid });
    if (!listing) return res.status(404).json({ message: "Listing not found" });

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    const newPhotos = req.files.map((file) => ({
      path: file.path,
      url: file.path,
      publicId: file.filename,
    }));

    listing.photosMeta = [...(listing.photosMeta || []), ...newPhotos];
    await listing.save();

    res.json({
      photosMeta: listing.photosMeta,
      coverIndex: listing.coverIndex,
    });
  } catch (e) {
    res.status(500).json({ message: e.message || "Upload failed" });
  }
};

exports.deletePhoto = async (req, res) => {
  try {
    const listing = await Listing.findOne({ _id: req.params.id, owner: req.user.uid });
    if (!listing) return res.status(404).json({ message: "Listing not found" });

    const index = parseInt(req.params.index, 10);
    if (isNaN(index) || index < 0 || index >= (listing.photosMeta || []).length) {
      return res.status(400).json({ message: "Invalid photo index" });
    }

    const photoToDelete = listing.photosMeta[index];
    
    // Delete from cloudinary
    if (photoToDelete.publicId) {
      try {
        await cloudinary.uploader.destroy(photoToDelete.publicId);
      } catch (e) {
        console.error("Failed to delete from cloudinary:", e);
      }
    }

    // Remove from array
    listing.photosMeta.splice(index, 1);

    // Adjust cover index if needed
    if (listing.coverIndex >= index && listing.coverIndex > 0) {
      listing.coverIndex = Math.max(0, listing.coverIndex - 1);
    }
    if (listing.photosMeta.length === 0) {
      listing.coverIndex = 0;
    }

    await listing.save();

    res.json({
      photosMeta: listing.photosMeta,
      coverIndex: listing.coverIndex,
    });
  } catch (e) {
    res.status(500).json({ message: e.message || "Delete failed" });
  }
};

exports.setCoverPhoto = async (req, res) => {
  try {
    const listing = await Listing.findOne({ _id: req.params.id, owner: req.user.uid });
    if (!listing) return res.status(404).json({ message: "Listing not found" });

    const { coverIndex } = req.body;
    const index = parseInt(coverIndex, 10);

    if (isNaN(index) || index < 0 || index >= (listing.photosMeta || []).length) {
      return res.status(400).json({ message: "Invalid cover index" });
    }

    listing.coverIndex = index;
    await listing.save();

    res.json({ coverIndex: listing.coverIndex });
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to set cover" });
  }
};

// ============================================
// CANCELLATION POLICY ENDPOINTS
// ============================================

/**
 * Get cancellation policy templates
 * GET /api/owner/cancellation-policies/templates
 */
exports.getPolicyTemplates = async (req, res) => {
  try {
    const templates = PolicyManager.getPolicyTemplates();
    res.json({ templates });
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to get policy templates" });
  }
};

/**
 * Get cancellation policy for a listing
 * GET /api/owner/listings/:id/cancellation-policy
 */
exports.getCancellationPolicy = async (req, res) => {
  try {
    const listing = await Listing.findOne({ 
      _id: req.params.id, 
      owner: req.user.uid 
    }).lean();
    
    if (!listing) {
      return res.status(404).json({ message: "Listing not found" });
    }

    const policy = await PolicyManager.getPolicy(req.params.id);
    res.json({ policy });
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to get cancellation policy" });
  }
};

/**
 * Set/Update cancellation policy for a listing
 * PUT /api/owner/listings/:id/cancellation-policy
 */
exports.setCancellationPolicy = async (req, res) => {
  try {
    // Verify listing ownership
    const listing = await Listing.findOne({ 
      _id: req.params.id, 
      owner: req.user.uid 
    });
    
    if (!listing) {
      return res.status(404).json({ message: "Listing not found" });
    }

    // Validation is handled by middleware
    // Set the policy
    const policy = await PolicyManager.setPolicy(req.params.id, req.body);
    
    res.json({ 
      policy,
      message: "Cancellation policy updated successfully" 
    });
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to set cancellation policy" });
  }
};
