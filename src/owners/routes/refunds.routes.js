// src/owners/routes/refunds.routes.js
const router = require("express").Router();
const requireUser = require("../../middleware/requireUser");
const CancellationRequest = require("../../models/CancellationRequest");
const Booking = require("../../models/Booking");
const Listing = require("../../models/Listing");
const User = require("../../models/User");
const CancellationRequestService = require("../../services/CancellationRequestService");

// GET /api/owner/refunds - Get all refund requests for owner
router.get("/", requireUser, async (req, res) => {
  try {
    const ownerId = req.user.uid;
    const { status, listingId, startDate, endDate, limit = 50, page = 1 } = req.query;

    // Build query
    const query = { ownerId };

    if (status && status !== "all") {
      query.status = status;
    }

    if (listingId && listingId !== "all") {
      query.listingId = listingId;
    }

    if (startDate) {
      query.requestedAt = { $gte: new Date(startDate) };
    }

    if (endDate) {
      query.requestedAt = query.requestedAt || {};
      query.requestedAt.$lte = new Date(endDate);
    }

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const requests = await CancellationRequest.find(query)
      .sort({ requestedAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .populate("clientId", "fullName email")
      .populate("listingId", "shortDesc title city region")
      .populate("bookingId", "code shortId")
      .lean();

    const total = await CancellationRequest.countDocuments(query);

    // Format response
    const formatted = requests.map((r) => ({
      id: r._id.toString(),
      ...r,
      clientName: r.clientId?.fullName,
      client: r.clientId,
      listingTitle: r.listingId?.shortDesc || r.listingId?.title,
      listing: r.listingId,
      bookingCode: r.bookingId?.code || r.bookingId?.shortId,
      booking: r.bookingId,
    }));

    res.json({
      requests: formatted,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (e) {
    console.error("[OwnerRefunds] GET error:", e);
    res.status(500).json({ message: e.message || "Failed to fetch refund requests" });
  }
});

// GET /api/owner/refunds/stats - Get refund statistics
router.get("/stats", requireUser, async (req, res) => {
  try {
    const ownerId = req.user.uid;
    const { startDate, endDate } = req.query;

    const query = { ownerId };

    if (startDate) {
      query.requestedAt = { $gte: new Date(startDate) };
    }

    if (endDate) {
      query.requestedAt = query.requestedAt || {};
      query.requestedAt.$lte = new Date(endDate);
    }

    const requests = await CancellationRequest.find(query).lean();

    const totalRequests = requests.length;
    const approved = requests.filter((r) =>
      ["approved", "processing", "completed"].includes(r.status)
    ).length;
    const rejected = requests.filter((r) => r.status === "rejected").length;
    const pending = requests.filter((r) => r.status === "pending").length;

    const total = approved + rejected;
    const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 0;

    const totalRefunded = requests
      .filter((r) => ["approved", "processing", "completed"].includes(r.status))
      .reduce((sum, r) => sum + (r.refundCalculation?.finalRefund || 0), 0);

    const avgRefundAmount =
      approved > 0 ? totalRefunded / approved : 0;

    // Reason breakdown
    const reasonBreakdown = {};
    requests.forEach((r) => {
      const reason = r.cancellationReason || "unknown";
      reasonBreakdown[reason] = (reasonBreakdown[reason] || 0) + 1;
    });

    res.json({
      totalRequests,
      pending,
      approved,
      rejected,
      approvalRate,
      totalRefunded,
      avgRefundAmount,
      reasonBreakdown,
    });
  } catch (e) {
    console.error("[OwnerRefunds] GET stats error:", e);
    res.status(500).json({ message: e.message || "Failed to fetch refund statistics" });
  }
});

// GET /api/owner/refunds/:id - Get single refund request
router.get("/:id", requireUser, async (req, res) => {
  try {
    const ownerId = req.user.uid;
    const { id } = req.params;

    const request = await CancellationRequest.findOne({
      _id: id,
      ownerId,
    })
      .populate("clientId", "fullName email phone")
      .populate("listingId", "shortDesc title city region country")
      .populate("bookingId")
      .lean();

    if (!request) {
      return res.status(404).json({ message: "Refund request not found" });
    }

    const formatted = {
      id: request._id.toString(),
      ...request,
      clientName: request.clientId?.fullName,
      client: request.clientId,
      listingTitle: request.listingId?.shortDesc || request.listingId?.title,
      listing: request.listingId,
      bookingCode: request.bookingId?.code || request.bookingId?.shortId,
      booking: request.bookingId,
    };

    res.json({ request: formatted });
  } catch (e) {
    console.error("[OwnerRefunds] GET :id error:", e);
    res.status(500).json({ message: e.message || "Failed to fetch refund request" });
  }
});

// POST /api/owner/refunds/:id/approve - Approve refund request
router.post("/:id/approve", requireUser, async (req, res) => {
  try {
    const ownerId = req.user.uid;
    const { id } = req.params;
    const { customRefundAmount, customRefundNote } = req.body;

    // Verify ownership
    const request = await CancellationRequest.findOne({
      _id: id,
      ownerId,
    });

    if (!request) {
      return res.status(404).json({ message: "Refund request not found" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ message: "Request has already been processed" });
    }

    // Validate custom amount if provided
    if (customRefundAmount !== undefined) {
      const amount = parseFloat(customRefundAmount);
      if (isNaN(amount) || amount < 0 || amount > request.bookingAmount) {
        return res.status(400).json({
          message: `Custom amount must be between 0 and ${request.bookingAmount}`,
        });
      }
      if (!customRefundNote || !customRefundNote.trim()) {
        return res.status(400).json({
          message: "Justification note is required for custom refund amounts",
        });
      }
    }

    // Approve the request
    const updatedRequest = await CancellationRequestService.approveRequest(
      id,
      ownerId,
      customRefundAmount,
      customRefundNote
    );

    res.json({
      message: "Refund request approved successfully",
      request: updatedRequest,
    });
  } catch (e) {
    console.error("[OwnerRefunds] POST approve error:", e);
    res.status(500).json({ message: e.message || "Failed to approve refund request" });
  }
});

// POST /api/owner/refunds/:id/reject - Reject refund request
router.post("/:id/reject", requireUser, async (req, res) => {
  try {
    const ownerId = req.user.uid;
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: "Rejection reason is required" });
    }

    // Verify ownership
    const request = await CancellationRequest.findOne({
      _id: id,
      ownerId,
    });

    if (!request) {
      return res.status(404).json({ message: "Refund request not found" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ message: "Request has already been processed" });
    }

    // Reject the request
    const updatedRequest = await CancellationRequestService.rejectRequest(
      id,
      ownerId,
      reason.trim()
    );

    res.json({
      message: "Refund request rejected",
      request: updatedRequest,
    });
  } catch (e) {
    console.error("[OwnerRefunds] POST reject error:", e);
    res.status(500).json({ message: e.message || "Failed to reject refund request" });
  }
});

module.exports = router;
