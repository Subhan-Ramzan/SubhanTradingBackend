// models/Config.js
import mongoose from "mongoose";

const ConfigSchema = new mongoose.Schema({
  symbol: { type: String},
  higher: {
    buyTrigger: Number,
    buyValue: Number,
    sellValue: Number,
    stopLoss: Number,
    quantity: Number
  },
  lower: {
    buyTrigger: Number,
    buyValue: Number,
    sellValue: Number,
    stopLoss: Number,
    quantity: Number
  },
  lastUpdated: { type: Date, default: Date.now }
});

export default mongoose.model("Config", ConfigSchema);
