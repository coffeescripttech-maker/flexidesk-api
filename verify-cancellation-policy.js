// verify-cancellation-policy.js
require('dotenv').config();
const mongoose = require('mongoose');
const Listing = require('./src/models/Listing');

const { MONGODB_URI } = process.env;

async function verify() {
  await mongoose.connect(MONGODB_URI);
  const listing = await Listing.findOne();
  console.log('Listing ID:', listing._id);
  console.log('Cancellation Policy:', JSON.stringify(listing.cancellationPolicy, null, 2));
  await mongoose.disconnect();
}

verify();
