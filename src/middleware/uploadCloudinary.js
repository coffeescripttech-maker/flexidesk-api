const multer = require("multer");
const cloudinary = require("../utils/cloudinary");
const multerStorageCloudinary = require("multer-storage-cloudinary");

const CloudinaryStorage =
  multerStorageCloudinary.CloudinaryStorage ||
  multerStorageCloudinary.default ||
  multerStorageCloudinary;

const avatarStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "flexidesk/avatars",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ width: 512, height: 512, crop: "limit" }],
  },
});

const identityStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "flexidesk/identity",
    allowed_formats: ["jpg", "jpeg", "png", "pdf"],
  },
});

const listingPhotosStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "flexidesk/listings",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ width: 1920, height: 1080, crop: "limit", quality: "auto" }],
  },
});

const reviewPhotosStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "flexidesk/reviews",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ width: 1200, height: 1200, crop: "limit", quality: "auto" }],
  },
});

exports.uploadAvatar = multer({ storage: avatarStorage });
exports.uploadIdentity = multer({ storage: identityStorage });
exports.uploadListingPhotos = multer({ storage: listingPhotosStorage });
exports.uploadReviewPhotos = multer({ storage: reviewPhotosStorage });
