const mongoose = require("mongoose");

// How long to wait between connection attempts. A transient MongoDB outage
// (service restarting, laptop sleep/wake dropping the socket) must never
// take the API down with it, so we retry forever instead of process.exit().
const RETRY_MS = Number(process.env.MONGO_RETRY_MS || 5000);

const bindConnectionEvents = () => {
  // Without an 'error' listener, a mid-run connection failure is emitted as
  // an 'error' event with no handler — which throws and kills the process.
  // Logging it here keeps the server alive while the driver reconnects.
  mongoose.connection.on("error", (err) => {
    console.error(`MongoDB connection error (retrying in background): ${err.message}`);
  });
  mongoose.connection.on("disconnected", () => {
    console.warn("MongoDB disconnected — retrying in background...");
  });
  mongoose.connection.on("reconnected", () => {
    console.log("MongoDB reconnected");
  });
};

const connectDB = async () => {
  bindConnectionEvents();
  for (;;) {
    try {
      const conn = await mongoose.connect(process.env.MONGODB_URI);
      console.log(`MongoDB connected: ${conn.connection.host}`);
      return conn;
    } catch (error) {
      console.error(
        `MongoDB connection failed (${error.message}) — retrying in ${RETRY_MS / 1000}s...`
      );
      await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
    }
  }
};

module.exports = connectDB;
