// src/controllers/admin/cases.controller.js
const Case = require("../../models/Case");

// Valid enums based on your model
const VALID_STATUS = [
  "open",
  "under_review",
  "awaiting_evidence",
  "resolved",
  "rejected",
  "refunded",
];

const VALID_TYPES = ["dispute", "refund_request", "violation_report"];
const VALID_PRIORITY = ["low", "medium", "high"];

function buildSort(key) {
  switch (key) {
    case "createdAt_asc":
      return { createdAt: 1, _id: 1 };
    case "updatedAt_desc":
      return { updatedAt: -1, createdAt: -1 };
    case "priority_desc":
      return { priority: -1, createdAt: -1 };
    case "createdAt_desc":
    default:
      return { createdAt: -1, _id: -1 };
  }
}

exports.listCases = async (req, res) => {
  try {
    const {
      search,
      status,
      type,
      assignee,
      priority,
      reportedBy,
      sort = "createdAt_desc",
      cursor,
      limit = 10,
    } = req.query;

    const pageSize = Math.min(Number(limit) || 10, 100);
    const pageIndex = Number(cursor || 0);

    const filter = {};

    if (status && VALID_STATUS.includes(status)) filter.status = status;
    if (type && VALID_TYPES.includes(type)) filter.type = type;
    if (assignee) filter.assignee = assignee;
    if (priority && VALID_PRIORITY.includes(priority))
      filter.priority = priority;
    if (reportedBy && reportedBy !== "all")
      filter.reportedByRole = reportedBy;

    // robust search filter
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      filter.$or = [
        { referenceCode: regex },
        { bookingRef: regex },
        { userEmail: regex },
        { userName: regex },
        { hostEmail: regex },
      ];
    }

    const sortObj = buildSort(sort);

    const docs = await Case.find(filter)
      .sort(sortObj)
      .skip(pageIndex * pageSize)
      .limit(pageSize + 1)
      .lean();

    const hasMore = docs.length > pageSize;
    const items = hasMore ? docs.slice(0, pageSize) : docs;

    return res.json({
      items,
      nextCursor: hasMore ? String(pageIndex + 1) : null,
    });
  } catch (err) {
    console.error("listCases error", err);
    res.status(500).json({ message: "Failed to load cases" });
  }
};

// -----------------------------
// ASSIGN CASE
// -----------------------------
exports.assignCase = async (req, res) => {
  try {
    const { id } = req.params;
    const { assignee } = req.body;

    const now = new Date();

    const update = {
      assignee: assignee || null,
      updatedAt: now,
      $push: {
        timeline: {
          at: now,
          type: "assigned",
          to: assignee || "Unassigned",
        },
      },
    };

    const kase = await Case.findByIdAndUpdate(id, update, { new: true });
    if (!kase) return res.status(404).json({ message: "Case not found" });

    res.json(kase);
  } catch (err) {
    console.error("assignCase error", err);
    res.status(500).json({ message: "Failed to assign case" });
  }
};

// -----------------------------
// UPDATE STATUS
// -----------------------------
exports.updateCaseStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!VALID_STATUS.includes(status)) {
      return res.status(422).json({ message: "Invalid status" });
    }

    const now = new Date();

    const update = {
      status,
      updatedAt: now,
      $push: {
        timeline: {
          at: now,
          type: "status_changed",
          to: status,
        },
      },
    };

    const kase = await Case.findByIdAndUpdate(id, update, { new: true });
    if (!kase) return res.status(404).json({ message: "Case not found" });

    res.json(kase);
  } catch (err) {
    console.error("updateCaseStatus error", err);
    res.status(500).json({ message: "Failed to update status" });
  }
};

// -----------------------------
// UPDATE ADMIN NOTES
// -----------------------------
exports.updateCaseNotes = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNotes } = req.body;

    const now = new Date();

    const update = {
      adminNotes: adminNotes || "",
      updatedAt: now,
      $push: {
        timeline: {
          at: now,
          type: "notes_updated",
        },
      },
    };

    const kase = await Case.findByIdAndUpdate(id, update, { new: true });
    if (!kase) return res.status(404).json({ message: "Case not found" });

    res.json(kase);
  } catch (err) {
    console.error("updateCaseNotes error", err);
    res.status(500).json({ message: "Failed to update admin notes" });
  }
};

// -----------------------------
// RECORD REFUND
// -----------------------------
exports.recordCaseRefund = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, reason } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(422).json({ message: "Invalid refund amount" });
    }
    if (!reason) {
      return res.status(422).json({ message: "Refund reason required" });
    }

    const now = new Date();

    const refund = {
      amount: Number(amount),
      reason,
      at: now,
      by: req.user?.email || "admin",
    };

    const update = {
      refund,
      status: "refunded",
      updatedAt: now,
      $push: {
        timeline: {
          at: now,
          type: "refunded",
          amount: refund.amount,
          reason: refund.reason,
        },
      },
    };

    const kase = await Case.findByIdAndUpdate(id, update, { new: true });
    if (!kase) return res.status(404).json({ message: "Case not found" });

    res.json(kase);
  } catch (err) {
    console.error("recordCaseRefund error", err);
    res.status(500).json({ message: "Failed to record refund" });
  }
};

// -----------------------------
// ADD EVIDENCE URL
// -----------------------------
exports.addCaseEvidence = async (req, res) => {
  try {
    const { id } = req.params;
    const { url } = req.body;

    if (!url) {
      return res.status(422).json({ message: "Evidence URL required" });
    }

    const now = new Date();

    const update = {
      updatedAt: now,
      $push: {
        evidence: {
          url,
          addedAt: now,
          addedBy: req.user?.email || "admin",
        },
        timeline: {
          at: now,
          type: "evidence_added",
          to: url,
        },
      },
    };

    const kase = await Case.findByIdAndUpdate(id, update, { new: true });
    if (!kase) return res.status(404).json({ message: "Case not found" });

    res.json(kase);
  } catch (err) {
    console.error("addCaseEvidence error", err);
    res.status(500).json({ message: "Failed to add evidence" });
  }
};
