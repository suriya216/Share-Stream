import mongoose, { Schema } from "mongoose";

export const User = mongoose.model(
  "User",
  new Schema(
    {
      username: { type: String, required: true, unique: true, lowercase: true, trim: true },
      passwordHash: { type: String, required: true },
    },
    { timestamps: true },
  ),
);

export const History = mongoose.model(
  "History",
  new Schema({
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    code: String,
    role: { type: String, enum: ["host", "guest"] },
    sourceType: String,
    source: String,
    at: { type: Date, default: Date.now },
  }),
);

export const connectDb = (uri: string) => mongoose.connect(uri);
export const disconnectDb = () => mongoose.disconnect();
