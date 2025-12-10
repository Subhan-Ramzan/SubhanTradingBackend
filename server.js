import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";

import ConfigModel from "./models/Config.js";
import {
  placeLimitBuy,
  placeLimitSell,
  placeOCOSell,
  fetchPriceOnce,
  resetAll,
  setSymbol,
} from "./Controller/Controller.js";

dotenv.config();
const PORT = process.env.PORT || 4000;

await mongoose
  .connect(process.env.MONGODB_URI, {})
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log("DB Error:", err));

const app = express();
app.use(express.json());
app.use(cors());

let latestPrice = null;
let strategyConfig = null;
let SYMBOL = "BNBUSDT";
setSymbol(SYMBOL); // initialize

// FETCH PRICE EVERY 5 SECONDS
setInterval(async () => {
  latestPrice = await fetchPriceOnce(true, strategyConfig, SYMBOL);
  console.log(`📉 Latest price for ${SYMBOL}: ${latestPrice}`);
}, 5000);

// ROUTES
app.get("/", (req, res) => res.send("Server is running..."));

// SELECT SYMBOL
app.post("/api/selected-symbol", async (req, res) => {
  const { symbol } = req.body;
  strategyConfig = await ConfigModel.findOne({ symbol });
  SYMBOL = symbol;
  setSymbol(SYMBOL);
  console.log("🔥 User selected symbol:", symbol);
  resetAll();
  res.json({ message: "Symbol received", symbol });
});

// SAVE CONFIG
app.post("/api/config", async (req, res) => {
  try {
    const { symbol, higher, lower } = req.body;
    await ConfigModel.deleteOne({ symbol });
    const newConfig = new ConfigModel({ symbol, higher, lower });
    await newConfig.save();
    res.json({ message: "Config Saved Successfully", data: newConfig });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET CONFIG BY SYMBOL
app.get("/api/config/:symbol", async (req, res) => {
  try {
    const config = await ConfigModel.findOne({ symbol: req.params.symbol });
    if (!config) return res.status(404).json({ message: "No Config Found" });
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET ALL CONFIGS
app.get("/api/config-list", async (req, res) => {
  try {
    const configs = await ConfigModel.find({}, { symbol: 1, _id: 0 });
    res.json(configs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET LATEST PRICE
app.get("/price", async (req, res) => res.json({ latestPrice }));

// RESET ALL
app.get("/reset", (req, res) => {
  resetAll();
  res.json({ msg: "All Reset" });
});

// PLACE LIMIT BUY
app.get("/buy", async (req, res) => {
  const price = 878;
  const quantity = 1;
  const order = await placeLimitBuy(price, quantity, SYMBOL);
  res.json({ msg: "Limit Buy Sent", order });
});

// PLACE LIMIT SELL
app.get("/sell", async (req, res) => {
  const price = 0.185;
  const quantity = 30;
  const order = await placeLimitSell(price, quantity, SYMBOL);
  res.json({ msg: "Limit Sell Sent", order });
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
