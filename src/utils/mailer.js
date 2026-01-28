// src/utils/mailer.js
const nodemailer = require("nodemailer");

const MAIL_HOST = process.env.MAIL_HOST;
const MAIL_PORT = Number(process.env.MAIL_PORT || 587);
const MAIL_USER = process.env.MAIL_USER;
const MAIL_PASS = process.env.MAIL_PASS;
const MAIL_FROM = process.env.MAIL_FROM || "FlexiDesk <no-reply@flexidesk.com>";
const MAIL_SECURE =
  process.env.MAIL_SECURE === "true" || MAIL_PORT === 465 || MAIL_PORT === 994;

// Log config (but not password) to help debug in prod
console.log("[MAILER] SMTP config:", {
  host: MAIL_HOST,
  port: MAIL_PORT,
  secure: MAIL_SECURE,
  user: MAIL_USER,
});

// Create transporter
const transporter = nodemailer.createTransport({
  host: MAIL_HOST,
  port: MAIL_PORT,
  secure: MAIL_SECURE,
  auth: {
    user: MAIL_USER,
    pass: MAIL_PASS,
  },
});

// Verify connection on startup
transporter
  .verify()
  .then(() => {
    console.log("[MAILER] SMTP connection verified");
  })
  .catch((err) => {
    console.error("[MAILER] SMTP verification failed:", {
      message: err.message,
      code: err.code,
      command: err.command,
    });
  });

async function sendMail({ to, subject, html }) {
  try {
    await transporter.sendMail({
      from: MAIL_FROM,
      to,
      subject,
      html,
    });
    return true;
  } catch (err) {
    console.error("Email send error:", {
      message: err.message,
      code: err.code,
      command: err.command,
    });
    return false;
  }
}

function fmt(d) {
  try {
    return new Date(d).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

async function sendBookingConfirmationEmail({ to, user, booking, listing }) {
  const fullName =
    user?.name ||
    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
    "Guest";

  const checkIn = fmt(booking.startDate);
  const checkOut = fmt(booking.endDate);

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 16px;">
      <h2>Hi ${fullName}, your booking is confirmed!</h2>

      <p>Thank you for booking with <b>FlexiDesk</b>.</p>

      <h3>Your Booking Details</h3>
      <ul>
        <li><b>Space:</b> ${listing?.venue || listing?.title}</li>
        <li><b>Location:</b> ${listing?.address || listing.city}</li>
        <li><b>Check-in:</b> ${checkIn} at ${booking.checkInTime}</li>
        <li><b>Check-out:</b> ${checkOut} at ${booking.checkOutTime}</li>
        <li><b>Total Hours:</b> ${booking.totalHours || "—"}</li>
        <li><b>Status:</b> Paid</li>
      </ul>

      <h3>Your QR Code</h3>
      <p>
        Your QR code for entry will be generated and sent
        <b>one day before your check-in date</b>.
      </p>

      <p style="margin-top: 24px;">
        Thank you for choosing FlexiDesk!
        <br/>If you have questions, simply reply to this email.
      </p>
    </div>
  `;

  return sendMail({
    to,
    subject: "Your FlexiDesk Booking is Confirmed",
    html,
  });
}

async function sendQrCodeEmail({ to, user, booking, qrUrl }) {
  const fullName =
    user?.name ||
    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
    "Guest";

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 16px;">
      <h2>Your FlexiDesk QR Code is Ready</h2>

      <p>Hi ${fullName},</p>

      <p>Your QR code for your booking is now available. Please present this QR code upon entry.</p>

      <p style="margin-top: 20px;">
        <a href="${qrUrl}" 
           style="background:#000; color:#fff; padding:10px 16px; text-decoration:none; border-radius:6px;">
          View QR Code
        </a>
      </p>

      <p style="margin-top: 20px; color:#555;">
        If you did not request this, please contact our support team.
      </p>
    </div>
  `;

  return sendMail({
    to,
    subject: "Your FlexiDesk QR Code",
    html,
  });
}

/**
 * Send cancellation confirmation email to client
 */
async function sendCancellationConfirmationEmail({ to, user, booking, listing, refundCalculation, cancellationRequest }) {
  const fullName =
    user?.name ||
    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
    "Guest";

  const checkIn = fmt(booking.startDate);
  const refundAmount = refundCalculation?.finalRefund || 0;
  const refundPercentage = refundCalculation?.refundPercentage || 0;
  const processingFee = refundCalculation?.processingFee || 0;
  const isAutomatic = cancellationRequest?.isAutomatic || false;

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 16px;">
      <h2>Booking Cancellation Confirmed</h2>

      <p>Hi ${fullName},</p>

      <p>Your booking cancellation has been confirmed.</p>

      <h3>Booking Details</h3>
      <ul>
        <li><b>Space:</b> ${listing?.title || listing?.venue}</li>
        <li><b>Location:</b> ${listing?.city || listing?.address}</li>
        <li><b>Date:</b> ${checkIn}</li>
        <li><b>Original Amount:</b> ₱${booking.amount?.toFixed(2)}</li>
      </ul>

      <h3>Refund Details</h3>
      <ul>
        <li><b>Refund Percentage:</b> ${refundPercentage}%</li>
        <li><b>Refund Amount:</b> ₱${refundCalculation?.refundAmount?.toFixed(2)}</li>
        <li><b>Processing Fee:</b> ₱${processingFee.toFixed(2)}</li>
        <li><b>Final Refund:</b> ₱${refundAmount.toFixed(2)}</li>
        <li><b>Status:</b> ${isAutomatic ? 'Processing (Automatic)' : 'Pending Owner Approval'}</li>
      </ul>

      <p>
        ${isAutomatic 
          ? 'Your refund will be processed automatically and will appear in your original payment method within 5-10 business days.' 
          : 'Your refund request is pending owner approval. You will receive another email once the owner reviews your request.'}
      </p>

      <p style="margin-top: 24px;">
        Thank you for using FlexiDesk.
        <br/>If you have questions, please reply to this email.
      </p>
    </div>
  `;

  return sendMail({
    to,
    subject: 'Booking Cancellation Confirmed - FlexiDesk',
    html,
  });
}

/**
 * Send refund request notification to owner
 */
async function sendRefundRequestNotificationEmail({ to, owner, client, booking, listing, refundCalculation, cancellationRequest }) {
  const ownerName =
    owner?.name ||
    `${owner?.firstName || ""} ${owner?.lastName || ""}`.trim() ||
    "Owner";

  const clientName =
    client?.name ||
    `${client?.firstName || ""} ${client?.lastName || ""}`.trim() ||
    "Guest";

  const checkIn = fmt(booking.startDate);
  const refundAmount = refundCalculation?.finalRefund || 0;
  const reason = cancellationRequest?.cancellationReason || 'Not specified';
  const reasonOther = cancellationRequest?.cancellationReasonOther || '';

  const reasonText = reason === 'other' ? reasonOther : reason.replace(/_/g, ' ');

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 16px;">
      <h2>New Refund Request for ${listing?.title || listing?.venue}</h2>

      <p>Hi ${ownerName},</p>

      <p>You have received a new refund request.</p>

      <h3>Request Details</h3>
      <ul>
        <li><b>Client:</b> ${clientName}</li>
        <li><b>Space:</b> ${listing?.title || listing?.venue}</li>
        <li><b>Booking Date:</b> ${checkIn}</li>
        <li><b>Refund Amount:</b> ₱${refundAmount.toFixed(2)}</li>
        <li><b>Reason:</b> ${reasonText}</li>
      </ul>

      <p>Please review and approve or reject this request in your dashboard.</p>

      <p style="margin-top: 20px;">
        <a href="${process.env.APP_URL}/owner/refunds" 
           style="background:#000; color:#fff; padding:10px 16px; text-decoration:none; border-radius:6px;">
          View Request
        </a>
      </p>

      <p style="margin-top: 24px;">
        Thank you for using FlexiDesk.
      </p>
    </div>
  `;

  return sendMail({
    to,
    subject: `New Refund Request - ${listing?.title || 'Your Workspace'}`,
    html,
  });
}

/**
 * Send refund approved email to client
 */
async function sendRefundApprovedEmail({
  to,
  user,
  booking,
  listing,
  refundCalculation,
  customRefundAmount,
  customRefundNote,
  cancellationRequest,
}) {
  const clientName = user?.firstName || user?.name || 'Valued Client';
  const listingTitle = listing?.title || listing?.shortDesc || 'Workspace';
  
  const finalRefund = customRefundAmount !== null && customRefundAmount !== undefined
    ? customRefundAmount
    : refundCalculation?.finalRefund || 0;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #10b981;">Your Refund Has Been Approved</h2>
      
      <p>Hi ${clientName},</p>
      
      <p>Good news! Your refund request has been approved by the workspace owner.</p>
      
      <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0;">Refund Details</h3>
        <p><strong>Workspace:</strong> ${listingTitle}</p>
        <p><strong>Booking Date:</strong> ${booking?.startDate ? new Date(booking.startDate).toLocaleDateString() : 'N/A'}</p>
        <p><strong>Original Amount:</strong> PHP ${refundCalculation?.originalAmount?.toFixed(2) || '0.00'}</p>
        <p><strong>Refund Amount:</strong> PHP ${finalRefund.toFixed(2)}</p>
        ${customRefundAmount !== null && customRefundAmount !== undefined ? `
          <p style="color: #f59e0b;"><strong>Note:</strong> The owner has adjusted the refund amount.</p>
          ${customRefundNote ? `<p><em>${customRefundNote}</em></p>` : ''}
        ` : ''}
      </div>
      
      <p>Your refund will be processed within 24 hours and will appear in your original payment method within 5-10 business days.</p>
      
      <p>Thank you for your understanding and for using FlexiDesk.</p>
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
      <p style="color: #6b7280; font-size: 12px;">
        This is an automated email. Please do not reply directly to this message.
      </p>
    </div>
  `;

  await sendMail({
    to,
    subject: `Refund Approved - ${listingTitle}`,
    html,
  });
}

/**
 * Send refund rejected email to client
 */
async function sendRefundRejectedEmail({
  to,
  user,
  booking,
  listing,
  rejectionReason,
  cancellationRequest,
}) {
  const clientName = user?.firstName || user?.name || 'Valued Client';
  const listingTitle = listing?.title || listing?.shortDesc || 'Workspace';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #ef4444;">Refund Request Update</h2>
      
      <p>Hi ${clientName},</p>
      
      <p>Your refund request has been reviewed by the workspace owner.</p>
      
      <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444;">
        <h3 style="margin-top: 0; color: #ef4444;">Status: Not Approved</h3>
        <p><strong>Workspace:</strong> ${listingTitle}</p>
        <p><strong>Booking Date:</strong> ${booking?.startDate ? new Date(booking.startDate).toLocaleDateString() : 'N/A'}</p>
        <p><strong>Reason:</strong></p>
        <p style="background-color: white; padding: 10px; border-radius: 4px;">${rejectionReason || 'No reason provided'}</p>
      </div>
      
      <p>If you have questions or concerns about this decision, please contact the workspace owner directly or reach out to our support team.</p>
      
      <p>Your booking remains active as scheduled.</p>
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
      <p style="color: #6b7280; font-size: 12px;">
        This is an automated email. Please do not reply directly to this message.
      </p>
    </div>
  `;

  await sendMail({
    to,
    subject: `Refund Request Update - ${listingTitle}`,
    html,
  });
}

/**
 * Send automatic refund processed notification to owner
 */
async function sendAutomaticRefundProcessedEmail({
  to,
  owner,
  client,
  booking,
  listing,
  refundCalculation,
  cancellationRequest,
}) {
  const ownerName =
    owner?.name ||
    `${owner?.firstName || ""} ${owner?.lastName || ""}`.trim() ||
    "Owner";

  const clientName =
    client?.name ||
    `${client?.firstName || ""} ${client?.lastName || ""}`.trim() ||
    "Guest";

  const checkIn = fmt(booking.startDate);
  const refundAmount = refundCalculation?.finalRefund || 0;

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 16px;">
      <h2>Automatic Refund Processed - ${listing?.title || listing?.venue}</h2>

      <p>Hi ${ownerName},</p>

      <p>A refund has been automatically processed for one of your bookings according to your cancellation policy.</p>

      <h3>Refund Details</h3>
      <ul>
        <li><b>Client:</b> ${clientName}</li>
        <li><b>Space:</b> ${listing?.title || listing?.venue}</li>
        <li><b>Booking Date:</b> ${checkIn}</li>
        <li><b>Refund Amount:</b> ₱${refundAmount.toFixed(2)}</li>
        <li><b>Processing:</b> Automatic (100% refund, >24 hours notice)</li>
      </ul>

      <p>This refund was processed automatically because:</p>
      <ul>
        <li>Your cancellation policy allows automatic refunds</li>
        <li>The client cancelled more than 24 hours before the booking</li>
        <li>The refund amount was 100% according to your policy</li>
      </ul>

      <p>No action is required from you. The refund has been initiated and will be completed within 5-10 business days.</p>

      <p style="margin-top: 20px;">
        <a href="${process.env.APP_URL}/owner/refunds" 
           style="background:#000; color:#fff; padding:10px 16px; text-decoration:none; border-radius:6px;">
          View Refund History
        </a>
      </p>

      <p style="margin-top: 24px;">
        Thank you for using FlexiDesk.
      </p>
    </div>
  `;

  return sendMail({
    to,
    subject: `Automatic Refund Processed - ${listing?.title || 'Your Workspace'}`,
    html,
  });
}

/**
 * Send owner reply notification to client
 */
async function sendOwnerReplyNotificationEmail({ to, client, owner, listing, review, reply }) {
  const clientName =
    client?.name ||
    `${client?.firstName || ""} ${client?.lastName || ""}`.trim() ||
    "Guest";

  const ownerName =
    owner?.name ||
    `${owner?.firstName || ""} ${owner?.lastName || ""}`.trim() ||
    "Owner";

  const listingName = listing?.venue || listing?.title || "the workspace";
  const reviewDate = fmt(review.createdAt);
  const replyDate = fmt(reply.createdAt);

  // Truncate review comment for email
  const reviewExcerpt = review.comment.length > 100 
    ? review.comment.substring(0, 100) + '...' 
    : review.comment;

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 16px;">
      <h2>Hi ${clientName},</h2>

      <p>
        <b>${ownerName}</b> has responded to your review of <b>${listingName}</b>.
      </p>

      <div style="background-color: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <h3 style="margin-top: 0;">Your Review (${reviewDate})</h3>
        <div style="margin-bottom: 8px;">
          ${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}
        </div>
        <p style="margin: 0;">"${reviewExcerpt}"</p>
      </div>

      <div style="background-color: #e8f4f8; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #2196F3;">
        <h3 style="margin-top: 0;">Owner's Response (${replyDate})</h3>
        <p style="margin: 0;">"${reply.text}"</p>
      </div>

      <p>
        Thank you for sharing your feedback and helping other users make informed decisions!
      </p>

      <p style="margin-top: 24px;">
        Best regards,<br/>
        The FlexiDesk Team
      </p>
    </div>
  `;

  return sendMail({
    to,
    subject: `${ownerName} replied to your review - ${listingName}`,
    html,
  });
}

module.exports = {
  sendMail,
  sendBookingConfirmationEmail,
  sendQrCodeEmail,
  sendCancellationConfirmationEmail,
  sendRefundRequestNotificationEmail,
  sendRefundApprovedEmail,
  sendRefundRejectedEmail,
  sendAutomaticRefundProcessedEmail,
  sendOwnerReplyNotificationEmail,
  sendReviewReminderEmail,
  sendNewReviewNotificationEmail,
  sendReviewFlaggedNotificationEmail,
  sendFlagResolutionEmail,
  sendReviewHiddenEmail,
  sendReviewDeletedEmail,
};

/**
 * Send review reminder email to client (3 days after booking)
 */
async function sendReviewReminderEmail({ to, user, booking, listing }) {
  const clientName =
    user?.name ||
    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
    "Guest";

  const listingName = listing?.venue || listing?.title || "the workspace";
  const bookingDate = fmt(booking.endDate);

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 16px; max-width: 600px; margin: 0 auto;">
      <h2>How was your experience at ${listingName}?</h2>

      <p>Hi ${clientName},</p>

      <p>We hope you enjoyed your recent booking at <b>${listingName}</b>!</p>

      <p>
        We'd love to hear about your experience. Your review helps other users make informed decisions 
        and helps workspace owners improve their services.
      </p>

      <div style="background-color: #f5f5f5; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0;">Your Booking</h3>
        <p><b>Workspace:</b> ${listingName}</p>
        <p><b>Date:</b> ${bookingDate}</p>
      </div>

      <p style="text-align: center; margin: 30px 0;">
        <a href="${process.env.APP_URL || 'http://localhost:5173'}/client/bookings" 
           style="background:#000; color:#fff; padding:12px 24px; text-decoration:none; border-radius:6px; display:inline-block;">
          Leave a Review
        </a>
      </p>

      <p style="color: #666; font-size: 14px;">
        This will only take a minute. Thank you for being part of the FlexiDesk community!
      </p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
      <p style="color: #6b7280; font-size: 12px;">
        This is an automated reminder. You can leave a review within 90 days of your booking.
      </p>
    </div>
  `;

  return sendMail({
    to,
    subject: `How was your experience at ${listingName}?`,
    html,
  });
}

/**
 * Send new review notification to owner
 */
async function sendNewReviewNotificationEmail({ to, owner, client, listing, review }) {
  const ownerName =
    owner?.name ||
    `${owner?.firstName || ""} ${owner?.lastName || ""}`.trim() ||
    "Owner";

  const clientName =
    client?.name ||
    `${client?.firstName || ""} ${client?.lastName || ""}`.trim() ||
    "Guest";

  const listingName = listing?.venue || listing?.title || "your workspace";
  const reviewDate = fmt(review.createdAt);

  // Truncate review comment for email
  const reviewExcerpt = review.comment.length > 150 
    ? review.comment.substring(0, 150) + '...' 
    : review.comment;

  const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 16px; max-width: 600px; margin: 0 auto;">
      <h2>New Review for ${listingName}</h2>

      <p>Hi ${ownerName},</p>

      <p>You've received a new review for <b>${listingName}</b>!</p>

      <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
        <div style="margin-bottom: 12px;">
          <span style="font-size: 24px; color: #f59e0b;">${stars}</span>
          <span style="margin-left: 8px; font-size: 18px; font-weight: bold;">${review.rating}/5</span>
        </div>
        <p style="margin: 8px 0;"><b>From:</b> ${clientName}</p>
        <p style="margin: 8px 0;"><b>Date:</b> ${reviewDate}</p>
        <div style="background-color: white; padding: 12px; border-radius: 4px; margin-top: 12px;">
          <p style="margin: 0; font-style: italic;">"${reviewExcerpt}"</p>
        </div>
      </div>

      <p style="text-align: center; margin: 30px 0;">
        <a href="${process.env.APP_URL || 'http://localhost:5173'}/owner/reviews" 
           style="background:#000; color:#fff; padding:12px 24px; text-decoration:none; border-radius:6px; display:inline-block;">
          View Full Review & Reply
        </a>
      </p>

      <p style="color: #666; font-size: 14px;">
        Responding to reviews shows you care about your guests' experience and can help improve your listing's reputation.
      </p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
      <p style="color: #6b7280; font-size: 12px;">
        This is an automated notification. You can reply to this review within 24 hours of receiving it.
      </p>
    </div>
  `;

  return sendMail({
    to,
    subject: `New Review for ${listingName} - ${stars}`,
    html,
  });
}

/**
 * Send review flagged notification to admin
 */
async function sendReviewFlaggedNotificationEmail({ to, review, listing, flagReason, flaggedBy }) {
  const listingName = listing?.venue || listing?.title || "a workspace";
  const reviewDate = fmt(review.createdAt);
  const flagDate = fmt(review.flaggedAt || new Date());

  // Truncate review comment for email
  const reviewExcerpt = review.comment.length > 200 
    ? review.comment.substring(0, 200) + '...' 
    : review.comment;

  const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 16px; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #ef4444;">⚠️ Review Flagged: Action Required</h2>

      <p>A review has been flagged and requires moderation:</p>

      <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444;">
        <h3 style="margin-top: 0; color: #ef4444;">Flagged Review Details</h3>
        <p><b>Listing:</b> ${listingName}</p>
        <p><b>Rating:</b> ${stars} (${review.rating}/5)</p>
        <p><b>Review Date:</b> ${reviewDate}</p>
        <p><b>Flagged Date:</b> ${flagDate}</p>
        <p><b>Flag Reason:</b> ${flagReason || 'Not specified'}</p>
        <p><b>Flagged By:</b> ${flaggedBy === 'system' ? 'Automatic System Detection' : 'User Report'}</p>
        
        <div style="background-color: white; padding: 12px; border-radius: 4px; margin-top: 12px;">
          <p style="margin: 0;"><b>Review Content:</b></p>
          <p style="margin: 8px 0; font-style: italic;">"${reviewExcerpt}"</p>
        </div>
      </div>

      <p style="text-align: center; margin: 30px 0;">
        <a href="${process.env.APP_URL || 'http://localhost:5173'}/admin/reviews/moderation" 
           style="background:#ef4444; color:#fff; padding:12px 24px; text-decoration:none; border-radius:6px; display:inline-block;">
          Review in Admin Panel
        </a>
      </p>

      <p style="color: #666; font-size: 14px;">
        Please review this content and take appropriate action (approve, hide, or delete).
      </p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
      <p style="color: #6b7280; font-size: 12px;">
        This is an automated notification for content moderation.
      </p>
    </div>
  `;

  return sendMail({
    to: to || process.env.ADMIN_EMAIL || 'admin@flexidesk.com',
    subject: `⚠️ Review Flagged for Moderation - ${listingName}`,
    html,
  });
}

/**
 * Send flag resolution notification to user who flagged
 */
async function sendFlagResolutionEmail({ to, user, review, action }) {
  const userName =
    user?.name ||
    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
    "User";

  const actionText = {
    approved: 'approved and will remain visible',
    hidden: 'hidden from public view',
    deleted: 'removed from the platform'
  }[action] || 'reviewed';

  const actionColor = {
    approved: '#10b981',
    hidden: '#f59e0b',
    deleted: '#ef4444'
  }[action] || '#6b7280';

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 16px; max-width: 600px; margin: 0 auto;">
      <h2>Review Flag Resolution</h2>

      <p>Hi ${userName},</p>

      <p>Thank you for reporting a review that violated our community guidelines.</p>

      <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${actionColor};">
        <h3 style="margin-top: 0;">Resolution</h3>
        <p>After reviewing the flagged content, our moderation team has determined that the review has been <b>${actionText}</b>.</p>
      </div>

      <p>
        We take community standards seriously and appreciate your help in maintaining a safe and trustworthy platform.
      </p>

      <p style="margin-top: 24px;">
        Best regards,<br/>
        The FlexiDesk Moderation Team
      </p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
      <p style="color: #6b7280; font-size: 12px;">
        This is an automated notification. If you have questions, please contact support.
      </p>
    </div>
  `;

  return sendMail({
    to,
    subject: 'Review Flag Resolution - FlexiDesk',
    html,
  });
}

/**
 * Send review hidden notification to review author
 */
async function sendReviewHiddenEmail({ to, user, review, reason }) {
  const userName =
    user?.name ||
    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
    "User";

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 16px; max-width: 600px; margin: 0 auto;">
      <h2>Your Review Has Been Hidden</h2>

      <p>Hi ${userName},</p>

      <p>We're writing to inform you that one of your reviews has been hidden from public view.</p>

      <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
        <h3 style="margin-top: 0;">Reason</h3>
        <p>${reason || 'The review violated our community guidelines.'}</p>
      </div>

      <p>
        Our community guidelines prohibit:
      </p>
      <ul style="color: #666;">
        <li>Profanity or offensive language</li>
        <li>Personal attacks or discriminatory content</li>
        <li>External links or promotional content</li>
        <li>Contact information sharing</li>
        <li>Spam or irrelevant content</li>
      </ul>

      <p>
        If you believe this was done in error, please contact our support team for review.
      </p>

      <p style="margin-top: 24px;">
        Best regards,<br/>
        The FlexiDesk Moderation Team
      </p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
      <p style="color: #6b7280; font-size: 12px;">
        This is an automated notification. Please reply to this email if you have questions.
      </p>
    </div>
  `;

  return sendMail({
    to,
    subject: 'Your Review Has Been Hidden - FlexiDesk',
    html,
  });
}

/**
 * Send review deleted notification to review author
 */
async function sendReviewDeletedEmail({ to, user, review, reason }) {
  const userName =
    user?.name ||
    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
    "User";

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 16px; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #ef4444;">Your Review Has Been Removed</h2>

      <p>Hi ${userName},</p>

      <p>We're writing to inform you that one of your reviews has been permanently removed from our platform.</p>

      <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444;">
        <h3 style="margin-top: 0; color: #ef4444;">Reason for Removal</h3>
        <p>${reason || 'The review seriously violated our community guidelines.'}</p>
      </div>

      <p>
        This action was taken because the content violated our Terms of Service. Repeated violations may result in account restrictions.
      </p>

      <p>
        If you believe this was done in error, please contact our support team within 7 days for review.
      </p>

      <p style="margin-top: 24px;">
        Best regards,<br/>
        The FlexiDesk Moderation Team
      </p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
      <p style="color: #6b7280; font-size: 12px;">
        This is an automated notification. Please reply to this email if you have questions.
      </p>
    </div>
  `;

  return sendMail({
    to,
    subject: 'Your Review Has Been Removed - FlexiDesk',
    html,
  });
}
