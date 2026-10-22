import { createApp } from "./app.js";
import { connectDb } from "./db.js";

const port = Number(process.env.PORT ?? 4000);
const mongoUri = process.env.MONGODB_URI;

if (mongoUri) {
  await connectDb(mongoUri);
  console.log("Accounts enabled (MongoDB connected)");
} else {
  console.log("MONGODB_URI not set: running without accounts");
}

const { http } = createApp({ accounts: !!mongoUri });
http.listen(port, () => console.log(`ShareStream server on :${port}`));
