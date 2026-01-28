// src/controllers/ownerAnalytics.controller.js
const mongoose = require("mongoose");
const Booking = require("../../models/Booking");
const Listing = require("../../models/Listing");

/* Helper – mirror your other controllers */
const uid = (req) =>
  req.user?._id || req.user?.id || req.user?.uid || null;

/**
 * GET /api/owner/analytics/summary
 * 
 * Query params:
 * - listingId: Filter by specific listing (optional)
 * - startDate: Start date for filtering (ISO string, optional)
 * - endDate: End date for filtering (ISO string, optional)
 * - month: Month number 1-12 (optional, overrides startDate/endDate)
 * - year: Year number (optional, used with month)
 *
 * Response:
 * {
 *   totalEarnings: Number,
 *   occupancyRate: Number,
 *   avgDailyEarnings: Number,
 *   peakHours: string[],
 *   listingStats: [
 *     {
 *       listingId,
 *       title,
 *       city,
 *       bookings,
 *       revenue,
 *       occupancyRate
 *     }
 *   ]
 * }
 */
async function getOwnerAnalyticsSummary(req, res) {
  try {
    const ownerId = uid(req);

    console.log("[Analytics] req.user:", req.user);
    console.log("[Analytics] ownerId (string):", ownerId);

    if (!ownerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const ownerObjectId = new mongoose.Types.ObjectId(ownerId);

    // Parse filters from query params
    const { listingId, startDate, endDate, month, year } = req.query;

    // Determine date range
    let start30, end30, daysWindow;

    if (month && year) {
      // Filter by specific month/year
      const monthNum = parseInt(month, 10);
      const yearNum = parseInt(year, 10);
      
      start30 = new Date(yearNum, monthNum - 1, 1);
      start30.setHours(0, 0, 0, 0);
      
      end30 = new Date(yearNum, monthNum, 0); // Last day of month
      end30.setHours(23, 59, 59, 999);
      
      daysWindow = end30.getDate(); // Number of days in the month
    } else if (month && !year) {
      // Month only - use current year
      const monthNum = parseInt(month, 10);
      const currentYear = new Date().getFullYear();
      
      start30 = new Date(currentYear, monthNum - 1, 1);
      start30.setHours(0, 0, 0, 0);
      
      end30 = new Date(currentYear, monthNum, 0); // Last day of month
      end30.setHours(23, 59, 59, 999);
      
      daysWindow = end30.getDate();
    } else if (year && !month) {
      // Year only - use entire year
      const yearNum = parseInt(year, 10);
      
      start30 = new Date(yearNum, 0, 1); // January 1st
      start30.setHours(0, 0, 0, 0);
      
      end30 = new Date(yearNum, 11, 31); // December 31st
      end30.setHours(23, 59, 59, 999);
      
      const diffTime = Math.abs(end30 - start30);
      daysWindow = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    } else if (startDate && endDate) {
      // Custom date range
      start30 = new Date(startDate);
      start30.setHours(0, 0, 0, 0);
      
      end30 = new Date(endDate);
      end30.setHours(23, 59, 59, 999);
      
      const diffTime = Math.abs(end30 - start30);
      daysWindow = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    } else {
      // Default: last 30 days
      const now = new Date();
      end30 = new Date(now);
      end30.setHours(23, 59, 59, 999);

      start30 = new Date(now);
      start30.setDate(start30.getDate() - 29);
      start30.setHours(0, 0, 0, 0);
      
      daysWindow = 30;
    }

    console.log("[Analytics] Date range:", { start30, end30, daysWindow });

    // Bookings that should be counted for revenue/occupancy
    const validStatuses = ["paid", "confirmed", "completed", "checked_in"];

    /* ========== 0) Get all listingIds for this owner ========== */
    let listingQuery = { owner: ownerObjectId };
    
    // Filter by specific listing if provided
    if (listingId) {
      listingQuery._id = new mongoose.Types.ObjectId(listingId);
    }

    const listingIds = await Listing.find(listingQuery).distinct("_id");

    console.log(
      "[Analytics] listingIds for owner:",
      listingIds.map((id) => id.toString())
    );

    if (!listingIds.length) {
      console.log("[Analytics] No listings found for owner.");
      return res.json({
        totalEarnings: 0,
        occupancyRate: 0,
        avgDailyEarnings: 0,
        peakHours: [],
        listingStats: [],
        filters: { listingId, startDate, endDate, month, year },
      });
    }

    // Common match for bookings
    const bookingMatchBase = {
      listingId: { $in: listingIds },
      status: { $in: validStatuses },
    };

    // Revenue expression: prefer pricingSnapshot.total, fallback to amount
    const revenueExpr = { $ifNull: ["$pricingSnapshot.total", "$amount"] };

    /* ========== 1) Total earnings (for selected period) ========== */
    const totalAgg = await Booking.aggregate([
      { 
        $match: {
          ...bookingMatchBase,
          createdAt: { $gte: start30, $lte: end30 },
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: revenueExpr },
        },
      },
    ]);

    const totalEarnings = totalAgg.length ? totalAgg[0].total : 0;

    console.log("[Analytics] totalEarnings:", totalEarnings);

    /* ========== 2) Selected period – earnings, bookings, hours ========== */
    const periodAgg = await Booking.aggregate([
      {
        $match: {
          ...bookingMatchBase,
          createdAt: { $gte: start30, $lte: end30 },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          dailyEarnings: { $sum: revenueExpr },
          bookings: { $sum: 1 },
          totalHours: { $sum: "$totalHours" },
        },
      },
    ]);

    console.log("[Analytics] periodAgg:", periodAgg);

    let totalPeriod = 0;
    let totalBookingsPeriod = 0;
    let totalHoursPeriod = 0;

    for (const row of periodAgg) {
      totalPeriod += row.dailyEarnings || 0;
      totalBookingsPeriod += row.bookings || 0;
      totalHoursPeriod += row.totalHours || 0;
    }

    const avgDailyEarnings =
      daysWindow > 0 ? totalPeriod / daysWindow : 0;

    /* ========== 3) Occupancy rate (simple hours-based estimate) ========== */
    const activeListingsCount = listingIds.length;

    let occupancyRate = 0;
    if (activeListingsCount > 0 && daysWindow > 0) {
      const capacityHours = activeListingsCount * 24 * daysWindow;
      occupancyRate =
        capacityHours > 0
          ? (totalHoursPeriod / capacityHours) * 100
          : 0;
    }

    /* ========== PHASE 1: Previous Period Comparison ========== */
    // Calculate previous period dates
    const prevEnd = new Date(start30);
    prevEnd.setDate(prevEnd.getDate() - 1);
    prevEnd.setHours(23, 59, 59, 999);
    
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - (daysWindow - 1));
    prevStart.setHours(0, 0, 0, 0);

    console.log("[Analytics] Previous period:", { prevStart, prevEnd });

    // Get previous period data
    const prevPeriodAgg = await Booking.aggregate([
      {
        $match: {
          ...bookingMatchBase,
          createdAt: { $gte: prevStart, $lte: prevEnd },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: revenueExpr },
          count: { $sum: 1 },
          totalHours: { $sum: "$totalHours" },
        },
      },
    ]);

    const prevEarnings = prevPeriodAgg.length ? prevPeriodAgg[0].total : 0;
    const prevBookings = prevPeriodAgg.length ? prevPeriodAgg[0].count : 0;
    const prevHours = prevPeriodAgg.length ? prevPeriodAgg[0].totalHours : 0;

    // Calculate previous occupancy
    const prevOccupancyRate = activeListingsCount > 0 && daysWindow > 0
      ? (prevHours / (activeListingsCount * 24 * daysWindow)) * 100
      : 0;

    // Calculate percentage changes
    const earningsChange = prevEarnings > 0 
      ? ((totalEarnings - prevEarnings) / prevEarnings * 100).toFixed(1)
      : totalEarnings > 0 ? 100 : 0;
    const bookingsChange = prevBookings > 0
      ? ((totalBookingsPeriod - prevBookings) / prevBookings * 100).toFixed(1)
      : totalBookingsPeriod > 0 ? 100 : 0;
    const occupancyChange = prevOccupancyRate > 0
      ? ((occupancyRate - prevOccupancyRate) / prevOccupancyRate * 100).toFixed(1)
      : occupancyRate > 0 ? 100 : 0;

    /* ========== PHASE 1: Customer Metrics ========== */
    // Get unique customers
    const uniqueCustomers = await Booking.distinct("userId", {
      ...bookingMatchBase,
      createdAt: { $gte: start30, $lte: end30 },
    });

    // Get repeat customers (customers with more than 1 booking)
    const repeatCustomersAgg = await Booking.aggregate([
      {
        $match: {
          ...bookingMatchBase,
          createdAt: { $gte: start30, $lte: end30 },
        },
      },
      {
        $group: {
          _id: "$userId",
          bookingCount: { $sum: 1 },
        },
      },
      {
        $match: {
          bookingCount: { $gt: 1 },
        },
      },
    ]);

    const repeatCustomers = repeatCustomersAgg.length;
    const retentionRate = uniqueCustomers.length > 0
      ? (repeatCustomers / uniqueCustomers.length * 100).toFixed(1)
      : 0;

    // Average booking value
    const averageBookingValue = totalBookingsPeriod > 0
      ? (totalEarnings / totalBookingsPeriod).toFixed(2)
      : 0;

    // Get cancellation metrics
    const cancelledBookings = await Booking.countDocuments({
      listingId: { $in: listingIds },
      status: "cancelled",
      createdAt: { $gte: start30, $lte: end30 },
    });

    const totalBookingsIncludingCancelled = totalBookingsPeriod + cancelledBookings;
    const cancellationRate = totalBookingsIncludingCancelled > 0
      ? (cancelledBookings / totalBookingsIncludingCancelled * 100).toFixed(1)
      : 0;

    /* ========== PHASE 1: Revenue by Category ========== */
    const revenueByCategory = await Booking.aggregate([
      {
        $match: {
          ...bookingMatchBase,
          createdAt: { $gte: start30, $lte: end30 },
        },
      },
      {
        $lookup: {
          from: "listings",
          localField: "listingId",
          foreignField: "_id",
          as: "listing",
        },
      },
      { $unwind: "$listing" },
      {
        $group: {
          _id: "$listing.category",
          revenue: { $sum: revenueExpr },
          bookings: { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
    ]);

    const categoryBreakdown = revenueByCategory.map(cat => ({
      category: cat._id || "uncategorized",
      revenue: cat.revenue,
      bookings: cat.bookings,
      percentage: totalEarnings > 0
        ? ((cat.revenue / totalEarnings) * 100).toFixed(1)
        : 0,
    }));

    /* ========== 4) Peak hours (top 3 hours by bookings in selected period) ========== */
    const peakHoursAgg = await Booking.aggregate([
      {
        $match: {
          ...bookingMatchBase,
          createdAt: { $gte: start30, $lte: end30 },
        },
      },
      {
        $group: {
          _id: { $hour: "$createdAt" },
          bookings: { $sum: 1 },
        },
      },
      { $sort: { bookings: -1 } },
      { $limit: 3 },
    ]);

    const peakHours = peakHoursAgg.map((row) => {
      const hour = row._id ?? 0;
      return `${hour.toString().padStart(2, "0")}:00`;
    });

    /* ========== 5) Listing performance (for table) ========== */
    const listingAgg = await Booking.aggregate([
      {
        $match: {
          ...bookingMatchBase,
          createdAt: { $gte: start30, $lte: end30 },
        },
      },
      {
        $lookup: {
          from: "listings",
          localField: "listingId",
          foreignField: "_id",
          as: "listing",
        },
      },
      { $unwind: "$listing" },
      {
        $group: {
          _id: "$listingId",
          title: { $first: "$listing.venue" },
          city: { $first: "$listing.city" },
          seats: { $first: "$listing.seats" },
          bookings: { $sum: 1 },
          revenue: { $sum: revenueExpr },
          totalHours: { $sum: "$totalHours" },
        },
      },
      { $sort: { revenue: -1 } },
    ]);

    console.log("[Analytics] listingAgg:", listingAgg);

    const listingStats = listingAgg.map((row) => {
      const capacityHours = daysWindow * 24; // per listing
      const occ =
        capacityHours > 0
          ? (row.totalHours / capacityHours) * 100
          : 0;

      return {
        listingId: row._id,
        title: row.title || "Untitled listing",
        city: row.city || "",
        bookings: row.bookings || 0,
        revenue: row.revenue || 0,
        occupancyRate: occ,
      };
    });

    return res.json({
      totalEarnings,
      occupancyRate,
      avgDailyEarnings,
      peakHours,
      listingStats,
      filters: { listingId, startDate, endDate, month, year },
      dateRange: { start: start30, end: end30, days: daysWindow },
      
      // PHASE 1: Comparison data
      comparison: {
        current: {
          earnings: totalEarnings,
          bookings: totalBookingsPeriod,
          occupancy: parseFloat(occupancyRate.toFixed(1)),
        },
        previous: {
          earnings: prevEarnings,
          bookings: prevBookings,
          occupancy: parseFloat(prevOccupancyRate.toFixed(1)),
        },
        change: {
          earnings: parseFloat(earningsChange),
          bookings: parseFloat(bookingsChange),
          occupancy: parseFloat(occupancyChange),
        },
      },
      
      // PHASE 1: Additional metrics
      metrics: {
        totalCustomers: uniqueCustomers.length,
        repeatCustomers: repeatCustomers,
        retentionRate: parseFloat(retentionRate),
        averageBookingValue: parseFloat(averageBookingValue),
        cancellationRate: parseFloat(cancellationRate),
        totalBookings: totalBookingsPeriod,
        cancelledBookings: cancelledBookings,
      },
      
      // PHASE 1: Revenue breakdown
      revenueByCategory: categoryBreakdown,
    });
  } catch (err) {
    console.error("Error in getOwnerAnalyticsSummary:", err);
    return res.status(500).json({
      message: "Failed to load analytics summary",
    });
  }
}

/* ========== PHASE 2: PREDICTIVE ANALYTICS ========== */

/**
 * GET /api/owner/analytics/predictions
 * 
 * Returns predictions for revenue, occupancy, and demand
 */
async function getPredictions(req, res) {
  try {
    const ownerId = uid(req);
    if (!ownerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const ownerObjectId = new mongoose.Types.ObjectId(ownerId);
    const validStatuses = ["paid", "confirmed", "completed", "checked_in"];

    // Get owner's listings
    const listingIds = await Listing.find({ owner: ownerObjectId }).distinct("_id");

    if (!listingIds.length) {
      return res.json({
        revenue: null,
        occupancy: null,
        demand: null,
        message: "No historical data available for predictions"
      });
    }

    // Get last 6 months of data for predictions
    const now = new Date();
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Get monthly revenue data
    const monthlyRevenue = await Booking.aggregate([
      {
        $match: {
          listingId: { $in: listingIds },
          status: { $in: validStatuses },
          createdAt: { $gte: sixMonthsAgo, $lte: now }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" }
          },
          revenue: { $sum: { $ifNull: ["$pricingSnapshot.total", "$amount"] } },
          bookings: { $sum: 1 },
          totalHours: { $sum: "$totalHours" }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);

    // Calculate predictions using moving average
    const revenuePrediction = predictRevenue(monthlyRevenue);
    const occupancyPrediction = predictOccupancy(monthlyRevenue, listingIds.length);
    const demandPrediction = predictDemand(monthlyRevenue);

    return res.json({
      revenue: revenuePrediction,
      occupancy: occupancyPrediction,
      demand: demandPrediction,
      dataPoints: monthlyRevenue.length,
      lastUpdated: new Date()
    });
  } catch (err) {
    console.error("Error in getPredictions:", err);
    return res.status(500).json({ message: "Failed to generate predictions" });
  }
}

/* ========== PHASE 3: PRESCRIPTIVE ANALYTICS ========== */

/**
 * GET /api/owner/analytics/recommendations
 * 
 * Returns actionable recommendations based on analytics and predictions
 */
async function getRecommendations(req, res) {
  try {
    const ownerId = uid(req);
    if (!ownerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const ownerObjectId = new mongoose.Types.ObjectId(ownerId);
    const validStatuses = ["paid", "confirmed", "completed", "checked_in"];

    // Get owner's listings
    const listingIds = await Listing.find({ owner: ownerObjectId }).distinct("_id");

    if (!listingIds.length) {
      return res.json({
        recommendations: [],
        message: "No data available for recommendations"
      });
    }

    // Get current analytics (last 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const currentAnalytics = await Booking.aggregate([
      {
        $match: {
          listingId: { $in: listingIds },
          status: { $in: validStatuses },
          createdAt: { $gte: thirtyDaysAgo, $lte: now }
        }
      },
      {
        $group: {
          _id: null,
          revenue: { $sum: { $ifNull: ["$pricingSnapshot.total", "$amount"] } },
          bookings: { $sum: 1 },
          totalHours: { $sum: "$totalHours" }
        }
      }
    ]);

    const analytics = currentAnalytics.length ? currentAnalytics[0] : { revenue: 0, bookings: 0, totalHours: 0 };
    
    // Calculate occupancy rate
    const capacityHours = listingIds.length * 24 * 30;
    const occupancyRate = capacityHours > 0 ? (analytics.totalHours / capacityHours) * 100 : 0;

    // Get cancellation data
    const cancelledBookings = await Booking.countDocuments({
      listingId: { $in: listingIds },
      status: "cancelled",
      createdAt: { $gte: thirtyDaysAgo, $lte: now }
    });

    const totalBookingsIncludingCancelled = analytics.bookings + cancelledBookings;
    const cancellationRate = totalBookingsIncludingCancelled > 0
      ? (cancelledBookings / totalBookingsIncludingCancelled) * 100
      : 0;

    // Get customer retention data
    const uniqueCustomers = await Booking.distinct("userId", {
      listingId: { $in: listingIds },
      status: { $in: validStatuses },
      createdAt: { $gte: thirtyDaysAgo, $lte: now }
    });

    const repeatCustomersAgg = await Booking.aggregate([
      {
        $match: {
          listingId: { $in: listingIds },
          status: { $in: validStatuses },
          createdAt: { $gte: thirtyDaysAgo, $lte: now }
        }
      },
      {
        $group: {
          _id: "$userId",
          bookingCount: { $sum: 1 }
        }
      },
      {
        $match: {
          bookingCount: { $gt: 1 }
        }
      }
    ]);

    const repeatCustomers = repeatCustomersAgg.length;
    const retentionRate = uniqueCustomers.length > 0
      ? (repeatCustomers / uniqueCustomers.length) * 100
      : 0;

    // Generate recommendations
    const recommendations = generateRecommendations({
      occupancyRate,
      cancellationRate,
      retentionRate,
      revenue: analytics.revenue,
      bookings: analytics.bookings,
      avgBookingValue: analytics.bookings > 0 ? analytics.revenue / analytics.bookings : 0
    });

    return res.json({
      recommendations,
      analytics: {
        occupancyRate: parseFloat(occupancyRate.toFixed(1)),
        cancellationRate: parseFloat(cancellationRate.toFixed(1)),
        retentionRate: parseFloat(retentionRate.toFixed(1)),
        revenue: analytics.revenue,
        bookings: analytics.bookings
      },
      generatedAt: new Date()
    });
  } catch (err) {
    console.error("Error in getRecommendations:", err);
    return res.status(500).json({ message: "Failed to generate recommendations" });
  }
}

/* ========== HELPER FUNCTIONS ========== */

// Predict next month's revenue using 3-month moving average
function predictRevenue(monthlyData) {
  if (monthlyData.length < 2) {
    return {
      nextMonth: null,
      trend: "insufficient_data",
      confidence: 0,
      message: "Need at least 2 months of data for predictions"
    };
  }

  // Use last 3 months (or all available if less than 3)
  const recentMonths = monthlyData.slice(-Math.min(3, monthlyData.length));
  const avgRevenue = recentMonths.reduce((sum, m) => sum + m.revenue, 0) / recentMonths.length;

  // Calculate trend
  let trend = "stable";
  if (monthlyData.length >= 2) {
    const lastMonth = monthlyData[monthlyData.length - 1].revenue;
    const prevMonth = monthlyData[monthlyData.length - 2].revenue;
    const change = ((lastMonth - prevMonth) / prevMonth) * 100;
    
    if (change > 10) trend = "increasing";
    else if (change < -10) trend = "decreasing";
  }

  // Apply trend adjustment
  let prediction = avgRevenue;
  if (trend === "increasing") prediction *= 1.05;
  else if (trend === "decreasing") prediction *= 0.95;

  // Calculate confidence based on data consistency
  const variance = calculateVariance(recentMonths.map(m => m.revenue));
  const confidence = Math.max(50, Math.min(95, 100 - (variance / avgRevenue) * 100));

  return {
    nextMonth: Math.round(prediction),
    trend,
    confidence: Math.round(confidence),
    range: {
      min: Math.round(prediction * 0.85),
      max: Math.round(prediction * 1.15)
    },
    basedOn: `${recentMonths.length} months of data`,
    factors: [
      `Historical average: ₱${Math.round(avgRevenue).toLocaleString()}`,
      `Trend: ${trend}`,
      `Data points: ${monthlyData.length} months`
    ]
  };
}

// Predict next week's occupancy
function predictOccupancy(monthlyData, listingCount) {
  if (monthlyData.length < 2) {
    return {
      nextWeek: null,
      trend: "insufficient_data",
      confidence: 0
    };
  }

  const recentMonths = monthlyData.slice(-Math.min(3, monthlyData.length));
  const avgHours = recentMonths.reduce((sum, m) => sum + m.totalHours, 0) / recentMonths.length;
  
  // Calculate average occupancy rate
  const daysPerMonth = 30;
  const capacityHours = listingCount * 24 * daysPerMonth;
  const avgOccupancy = capacityHours > 0 ? (avgHours / capacityHours) * 100 : 0;

  // Predict next week (7 days)
  const weekCapacity = listingCount * 24 * 7;
  const predictedHours = (avgHours / daysPerMonth) * 7;
  const predictedOccupancy = weekCapacity > 0 ? (predictedHours / weekCapacity) * 100 : 0;

  // Typical weekly pattern (higher on weekdays)
  const weeklyPattern = {
    monday: predictedOccupancy * 1.2,
    tuesday: predictedOccupancy * 1.1,
    wednesday: predictedOccupancy * 1.15,
    thursday: predictedOccupancy * 1.1,
    friday: predictedOccupancy * 0.95,
    saturday: predictedOccupancy * 0.7,
    sunday: predictedOccupancy * 0.5
  };

  return {
    nextWeek: Object.fromEntries(
      Object.entries(weeklyPattern).map(([day, rate]) => [day, Math.round(Math.min(100, rate))])
    ),
    average: Math.round(predictedOccupancy),
    trend: avgOccupancy > 60 ? "high" : avgOccupancy > 40 ? "moderate" : "low",
    confidence: 75,
    peakDays: ["monday", "wednesday"],
    recommendation: avgOccupancy > 70 
      ? "Consider increasing prices during peak days"
      : "Consider promotions to increase occupancy"
  };
}

// Predict demand (bookings)
function predictDemand(monthlyData) {
  if (monthlyData.length < 2) {
    return {
      nextMonth: null,
      trend: "insufficient_data",
      confidence: 0
    };
  }

  const recentMonths = monthlyData.slice(-Math.min(3, monthlyData.length));
  const avgBookings = recentMonths.reduce((sum, m) => sum + m.bookings, 0) / recentMonths.length;

  // Calculate growth rate
  let growthRate = 0;
  if (monthlyData.length >= 2) {
    const lastMonth = monthlyData[monthlyData.length - 1].bookings;
    const prevMonth = monthlyData[monthlyData.length - 2].bookings;
    growthRate = prevMonth > 0 ? ((lastMonth - prevMonth) / prevMonth) * 100 : 0;
  }

  const prediction = Math.round(avgBookings * (1 + growthRate / 100));

  return {
    nextMonth: {
      expectedBookings: prediction,
      expectedRevenue: Math.round(prediction * (recentMonths.reduce((sum, m) => sum + m.revenue, 0) / recentMonths.reduce((sum, m) => sum + m.bookings, 0))),
      confidence: 70
    },
    trend: growthRate > 5 ? "increasing" : growthRate < -5 ? "decreasing" : "stable",
    growthRate: parseFloat(growthRate.toFixed(1)),
    recommendations: [
      growthRate > 10 ? "High demand expected - consider increasing prices" : null,
      growthRate < -10 ? "Declining demand - consider promotions" : null,
      "Monitor booking velocity weekly"
    ].filter(Boolean)
  };
}

// Generate rule-based recommendations
function generateRecommendations(analytics) {
  const recommendations = [];

  // Rule 1: Low occupancy
  if (analytics.occupancyRate < 50) {
    recommendations.push({
      type: "pricing",
      priority: "high",
      title: "Increase occupancy with promotional pricing",
      description: `Your occupancy rate is ${analytics.occupancyRate.toFixed(1)}%, which is below optimal. Consider offering a 10-15% discount to attract more bookings.`,
      expectedImpact: "+20% bookings",
      action: "reduce_price",
      actionDetails: {
        type: "percentage_discount",
        value: 15,
        duration: "2 weeks"
      },
      icon: "💰"
    });
  }

  // Rule 2: High occupancy
  if (analytics.occupancyRate > 75) {
    recommendations.push({
      type: "pricing",
      priority: "medium",
      title: "Optimize revenue with premium pricing",
      description: `Your occupancy rate is ${analytics.occupancyRate.toFixed(1)}%, which is excellent! You can increase prices by 10-15% to maximize revenue.`,
      expectedImpact: "+15% revenue",
      action: "increase_price",
      actionDetails: {
        type: "percentage_increase",
        value: 12,
        duration: "ongoing"
      },
      icon: "📈"
    });
  }

  // Rule 3: High cancellation rate
  if (analytics.cancellationRate > 15) {
    recommendations.push({
      type: "operations",
      priority: "high",
      title: "Reduce cancellation rate",
      description: `Your cancellation rate is ${analytics.cancellationRate.toFixed(1)}%, which is above average. Review your booking policies and send confirmation reminders.`,
      expectedImpact: "-30% cancellations",
      action: "improve_policies",
      actionDetails: {
        steps: [
          "Send booking confirmation emails immediately",
          "Send reminder 24 hours before booking",
          "Review cancellation policy clarity",
          "Offer flexible rescheduling options"
        ]
      },
      icon: "⚠️"
    });
  }

  // Rule 4: Low retention rate
  if (analytics.retentionRate < 30) {
    recommendations.push({
      type: "retention",
      priority: "high",
      title: "Launch customer retention program",
      description: `Only ${analytics.retentionRate.toFixed(1)}% of customers are returning. Implement a loyalty program to encourage repeat bookings.`,
      expectedImpact: "+40% retention",
      action: "loyalty_program",
      actionDetails: {
        type: "points_based",
        rewards: [
          "10% off after 3 bookings",
          "Free hour after 5 bookings",
          "Priority booking for members"
        ]
      },
      icon: "🎁"
    });
  }

  // Rule 5: Good retention rate
  if (analytics.retentionRate >= 50) {
    recommendations.push({
      type: "marketing",
      priority: "low",
      title: "Leverage satisfied customers",
      description: `Your retention rate of ${analytics.retentionRate.toFixed(1)}% is excellent! Ask satisfied customers for referrals and reviews.`,
      expectedImpact: "+25% new customers",
      action: "referral_program",
      actionDetails: {
        incentive: "₱100 credit for each referral",
        channels: ["email", "in-app"]
      },
      icon: "⭐"
    });
  }

  // Rule 6: Low average booking value
  if (analytics.avgBookingValue > 0 && analytics.avgBookingValue < 500) {
    recommendations.push({
      type: "revenue",
      priority: "medium",
      title: "Increase average booking value",
      description: `Your average booking value is ₱${Math.round(analytics.avgBookingValue)}. Offer add-ons and packages to increase transaction size.`,
      expectedImpact: "+20% per booking",
      action: "upsell",
      actionDetails: {
        suggestions: [
          "Bundle hours at discounted rate",
          "Offer meeting room + equipment packages",
          "Add premium amenities (coffee, printing)",
          "Create day passes vs hourly rates"
        ]
      },
      icon: "💎"
    });
  }

  // Rule 7: Seasonal recommendation
  const currentMonth = new Date().getMonth();
  if ([0, 1, 11].includes(currentMonth)) { // Jan, Feb, Dec
    recommendations.push({
      type: "marketing",
      priority: "medium",
      title: "Prepare for Q1 business season",
      description: "Many businesses plan their year in Q1. Launch a 'New Year Productivity' campaign targeting startups and freelancers.",
      expectedImpact: "+30% bookings",
      action: "seasonal_campaign",
      actionDetails: {
        theme: "New Year, New Workspace",
        channels: ["social_media", "email", "local_ads"],
        budget: "₱5,000 - ₱10,000"
      },
      icon: "🎯"
    });
  }

  // Rule 8: General marketing
  if (analytics.bookings < 10) {
    recommendations.push({
      type: "marketing",
      priority: "high",
      title: "Increase visibility and awareness",
      description: `With only ${analytics.bookings} bookings this month, focus on marketing. Invest in social media ads and local partnerships.`,
      expectedImpact: "+50% bookings",
      action: "marketing_campaign",
      actionDetails: {
        channels: [
          "Facebook/Instagram ads targeting local businesses",
          "Google My Business optimization",
          "Partner with local coworking communities",
          "Offer first-time user discounts"
        ],
        budget: "₱3,000 - ₱5,000/month"
      },
      icon: "📣"
    });
  }

  // Sort by priority
  const priorityOrder = { high: 1, medium: 2, low: 3 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return recommendations;
}

// Calculate variance for confidence scoring
function calculateVariance(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
  return Math.sqrt(squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length);
}

module.exports = {
  getOwnerAnalyticsSummary,
  getPredictions,
  getRecommendations,
};
