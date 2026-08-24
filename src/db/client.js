import mongoose from 'mongoose';

let isConnected = false; // Track the connection status

async function dbConnect() {
  // If already connected, reuse the connection
  if (isConnected || mongoose.connection.readyState >= 1) {
    console.log('Already connected to MongoDB');
    return;
  }

  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);

    isConnected = true; // Set the flag once connected
    // console.log('MongoDB connected');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    throw error;
  }
}

export default dbConnect;

