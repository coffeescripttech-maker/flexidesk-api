// src/admins/controllers/cancellations.controller.js
const mongoose = require("mongoose");
const CancellationRequest = require("../../models/CancellationRequest");
const RefundTransaction = require("../../models/RefundTransaction");
const Booking = require("../../models/Booking");
const User = require("../../models/User");
const Listing = require("../../models/Listing");

/**
 * GET /api/admin/cancellations
 * 
 * List all cancellation requests with full user details
 * Query params:
 *  - page, limit
 *  - status (pending, approved, rejected, processing, completed, failed)
 *  - isAutomatic (true/false)
 *  - dateFrom, dateTo
 *  - search (client name, email, booking ref)
 */
exports.listCancellations = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      isAutomatic,
      dateFrom,
      dateTo,
      search,
    } = req.query;

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));

    const filter = {};

    // Status filter
    if (status && status !== "all") {
      filter.status = status;
    }

    // Automatic vs manual filter
    if (isAutomatic !== undefined && isAutomatic !== "all") {
      filter.isAutomatic = isAutomatic === "true";
    }

    // Date range filter
    if (dateFrom || dateTo) {
      filter.requestedAt = {};
      if (dateFrom) {
        filter.requestedAt.$gte = new Date(dateFrom + "T00:00:00Z");
      }
      if (dateTo) {
        filter.requestedAt.$lte = new Date(dateTo + "T23:59:59Z");
      }
    }

    // Get cancellation requests with populated references
    const [requests, total] = await Promise.all([
      CancellationRequest.find(filter)
        .populate("clientId", "fullName email phone")
        .populate("ownerId", "fullName email phone")
        .populate("listingId", "title venue city")
        .populate("bookingId", "startDate endDate amount status")
        .populate("approvedBy", "fullName email")
        .populate("rejectedBy", "fullName email")
        .sort({ requestedAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      CancellationRequest.countDocuments(filter),
    ]);

    // Get refund transactions for each request
    const requestIds = requests.map((r) => r._id);
    const refundTransactions = await RefundTransaction.find({
      cancellationRequestId: { $in: requestIds },
    }).lean();

    const refundMap = new Map();
    refundTransactions.forEach((rt) => {
      refundMap.set(rt.cancellationRequestId.toString(), rt);
    });

    // Apply search filter (client-side for flexibility)
    let filteredRequests = requests;
    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      filteredRequests = requests.filter((r) => {
        const clientName = r.clientId?.fullName?.toLowerCase() || "";
        const clientEmail = r.clientId?.email?.toLowerCase() || "";
        const ownerName = r.ownerId?.fullName?.toLowerCase() || "";
        const ownerEmail = r.ownerId?.email?.toLowerCase() || "";
        const bookingId = r.bookingId?._id?.toString() || "";
        const listingTitle = r.listingId?.title?.toLowerCase() || "";

        return (
          clientName.includes(term) ||
          clientEmail.includes(term) ||
          ownerName.includes(term) ||
          ownerEmail.includes(term) ||
          bookingId.includes(term) ||
          listingTitle.includes(term)
        );
      });
    }

    // Format response
    const items = filteredRequests.map((r) => {
      const refundTxn = refundMap.get(r._id.toString());

      return {
        id: r._id,
        
        // Client (requester) information
        client: r.clientId
          ? {
              id: r.clientId._id,
              name: r.clientId.fullName || "Unknown",
              email: r.clientId.email || "",
              phone: r.clientId.phone || "",
            }
          : null,

        // Owner information
        owner: r.ownerId
          ? {
              id: r.ownerId._id,
              name: r.ownerId.fullName || "Unknown",
              email: r.ownerId.email || "",
              phone: r.ownerId.phone || "",
            }
          : null,

        // Listing information
        listing: r.listingId
          ? {
              id: r.listingId._id,
              title: r.listingId.title || r.listingId.venue || "Unknown",
              venue: r.listingId.venue || "",
              city: r.listingId.city || "",
            }
          : null,

        // Booking information
        booking: r.bookingId
          ? {
              id: r.bookingId._id,
              startDate: r.bookingId.startDate,
              endDate: r.bookingId.endDate,
              amount: r.bookingId.amount,
              status: r.bookingId.status,
            }
          : {
              startDate: r.bookingStartDate,
              endDate: r.bookingEndDate,
              amount: r.bookingAmount,
            },

        // Request details
        requestedAt: r.requestedAt,
        status: r.status,
        isAutomatic: r.isAutomatic,

        // Refund calculation
        refundCalculation: r.refundCalculation,
        customRefundAmount: r.customRefundAmount,
        customRefundNote: r.customRefundNote,

        // Cancellation reason
        cancellationReason: r.cancellationReason,
        cancellationReasonOther: r.cancellationReasonOther,

        // Approval/Rejection
        approvedBy: r.approvedBy
          ? {
              id: r.approvedBy._id,
              name: r.approvedBy.fullName || "Unknown",
              email: r.approvedBy.email || "",
            }
          : null,
        approvedAt: r.approvedAt,
        rejectedBy: r.rejectedBy
          ? {
              id: r.rejectedBy._id,
              name: r.rejectedBy.fullName || "Unknown",
              email: r.rejectedBy.email || "",
            }
          : null,
        rejectedAt: r.rejectedAt,
        rejectionReason: r.rejectionReason,

        // Processing
        processedAt: r.processedAt,
        refundTransactionId: r.refundTransactionId,
        retryCount: r.retryCount,
        lastRetryAt: r.lastRetryAt,
        failureReason: r.failureReason,

        // Refund transaction details
        refundTransaction: refundTxn
          ? {
              id: refundTxn._id,
              amount: refundTxn.amount,
              currency: refundTxn.currency,
              status: refundTxn.status,
              gatewayProvider: refundTxn.gatewayProvider,
              refundTransactionId: refundTxn.refundTransactionId,
              initiatedAt: refundTxn.initiatedAt,
              completedAt: refundTxn.completedAt,
              failedAt: refundTxn.failedAt,
              gatewayError: refundTxn.gatewayError,
            }
          : null,

        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    });

    res.json({
      items,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    console.error("listCancellations error:", err);
    res.status(500).json({ message: "Failed to load cancellation requests" });
  }
};

/**
 * GET /api/admin/cancellations/:id
 * 
 * Get detailed information about a specific cancellation request
 */
exports.getCancellationDetails = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid cancellation ID" });
    }

    const request = await CancellationRequest.findById(id)
      .populate("clientId", "fullName email phone")
      .populate("ownerId", "fullName email phone")
      .populate("listingId", "title venue city country address")
      .populate("bookingId")
      .populate("approvedBy", "fullName email")
      .populate("rejectedBy", "fullName email")
      .lean();

    if (!request) {
      return res.status(404).json({ message: "Cancellation request not found" });
    }

    // Get refund transaction
    const refundTxn = await RefundTransaction.findOne({
      cancellationRequestId: id,
    }).lean();

    res.json({
      request,
      refundTransaction: refundTxn,
    });
  } catch (err) {
    console.error("getCancellationDetails error:", err);
    res.status(500).json({ message: "Failed to load cancellation details" });
  }
};

/**
 * GET /api/admin/cancellations/stats
 * 
 * Get statistics about cancellation requests
 */
exports.getCancellationStats = async (req, res) => {
  try {
    const [
      totalRequests,
      pendingRequests,
      approvedRequests,
      rejectedRequests,
      processingRequests,
      completedRequests,
      failedRequests,
      automaticRequests,
      manualRequests,
    ] = await Promise.all([
      CancellationRequest.countDocuments(),
      CancellationRequest.countDocuments({ status: "pending" }),
      CancellationRequest.countDocuments({ status: "approved" }),
      CancellationRequest.countDocuments({ status: "rejected" }),
      CancellationRequest.countDocuments({ status: "processing" }),
      CancellationRequest.countDocuments({ status: "completed" }),
      CancellationRequest.countDocuments({ status: "failed" }),
      CancellationRequest.countDocuments({ isAutomatic: true }),
      CancellationRequest.countDocuments({ isAutomatic: false }),
    ]);

    // Calculate total refund amounts
    const refundStats = await CancellationRequest.aggregate([
      {
        $match: {
          status: { $in: ["approved", "processing", "completed"] },
        },
      },
      {
        $group: {
          _id: null,
          totalRefundAmount: {
            $sum: "$refundCalculation.finalRefund",
          },
          avgRefundAmount: {
            $avg: "$refundCalculation.finalRefund",
          },
          totalOriginalAmount: {
            $sum: "$refundCalculation.originalAmount",
          },
        },
      },
    ]);

    const stats = refundStats[0] || {
      totalRefundAmount: 0,
      avgRefundAmount: 0,
      totalOriginalAmount: 0,
    };

    res.json({
      total: totalRequests,
      byStatus: {
        pending: pendingRequests,
        approved: approvedRequests,
        rejected: rejectedRequests,
        processing: processingRequests,
        completed: completedRequests,
        failed: failedRequests,
      },
      byType: {
        automatic: automaticRequests,
        manual: manualRequests,
      },
      refunds: {
        totalRefundAmount: stats.totalRefundAmount,
        avgRefundAmount: stats.avgRefundAmount,
        totalOriginalAmount: stats.totalOriginalAmount,
        refundRate:
          stats.totalOriginalAmount > 0
            ? (stats.totalRefundAmount / stats.totalOriginalAmount) * 100
            : 0,
      },
    });
  } catch (err) {
    console.error("getCancellationStats error:", err);
    res.status(500).json({ message: "Failed to load cancellation stats" });
  }
};
