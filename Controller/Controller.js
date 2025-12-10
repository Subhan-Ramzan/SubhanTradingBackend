import pkg from "binance-api-node";
const Binance = pkg.default;
import dotenv from "dotenv";
dotenv.config();

const client = Binance({
  apiKey: process.env.BINANCE_KEY || "",
  apiSecret: process.env.BINANCE_SECRET || "",
  httpBase: "https://testnet.binance.vision",
  recvWindow: 60000,
});

// ----------------- GLOBAL STATE -----------------
let HigherBuyExecuted = false;
let HigherBuyOrderId = null;
let HigherOCOOrderData = null;
let HigherstopLossId = null;
let HighertakeProfitId = null;

let lowerBuyExecuted = false;
let lowerBuyOrderId = null;
let LowerOCOOrderData = null;
let LowerstopLossId = null;
let LowertakeProfitId = null;

let CURRENT_SYMBOL = "BNBUSDT";

export function setSymbol(symbol) {
  CURRENT_SYMBOL = symbol;
}

// ----------------- RESET ALL -----------------
export function resetAll() {
  HigherBuyExecuted = false;
  HigherBuyOrderId = null;
  HigherOCOOrderData = null;
  HigherstopLossId = null;
  HighertakeProfitId = null;

  lowerBuyExecuted = false;
  lowerBuyOrderId = null;
  LowerOCOOrderData = null;
  LowerstopLossId = null;
  LowertakeProfitId = null;

  console.log("🔄 ALL VARIABLES RESET → Bot is ready!");
}

// ----------------- FETCH PRICE -----------------
export async function fetchPriceOnce(returnPriceOnly = false, config, SYMBOL) {
  try {
    const prices = await client.prices({ symbol: SYMBOL });
    const price = parseFloat(prices[SYMBOL]);
    console.log(`📉 New Price: ${price}`);

    if (!config) return price;

    const {
      higher: {
        buyTrigger: HigherBuyTrigger,
        buyValue: HigherBuyValue,
        sellValue: HigherSellValue,
        stopLoss: HigherStopLoss,
        quantity: HigherQuantity,
      },
      lower: {
        buyTrigger: LowerBuyTrigger,
        buyValue: LowerBuyValue,
        sellValue: LowerSellValue,
        stopLoss: LowerStopLoss,
        quantity: LowerQuantity,
      },
    } = config;

    // ----------------- LOWER STRATEGY -----------------
    if (!lowerBuyExecuted) {
      if (!lowerBuyOrderId && price < LowerBuyTrigger) {
        console.log("🔥 LOWER BUY TRIGGER HIT → PLACING BUY");
        const orderResult = await placeLimitBuy(LowerBuyValue, LowerQuantity, SYMBOL);
        if (!orderResult) return price;
        lowerBuyOrderId = orderResult.orderId;
        console.log("📌 LOWER BUY ORDER ID:", lowerBuyOrderId);
      }

      if (lowerBuyOrderId) {
        const orderDetails = await client.getOrder({ symbol: SYMBOL, orderId: lowerBuyOrderId });
        if (orderDetails.status === "FILLED" && !LowerOCOOrderData) {
          console.log("🎯 LOWER BUY FILLED → PLACING OCO SELL");
          LowerOCOOrderData = await placeOCOSell(LowerQuantity, LowerSellValue, LowerStopLoss, LowerStopLoss, SYMBOL);
          LowerstopLossId = LowerOCOOrderData?.orderReports?.[0]?.orderId;
          LowertakeProfitId = LowerOCOOrderData?.orderReports?.[1]?.orderId;
        }
        if (LowerstopLossId && LowertakeProfitId) {
          const StopLossData = await client.getOrder({ symbol: SYMBOL, orderId: LowerstopLossId });
          const TakeProfitData = await client.getOrder({ symbol: SYMBOL, orderId: LowertakeProfitId });
          if (StopLossData.status === "FILLED" || TakeProfitData.status === "FILLED") {
            lowerBuyExecuted = true;
            console.log("🎉 LOWER SELL COMPLETED → PROCESS DONE");
          }
        }
      }
    }

    // ----------------- HIGHER STRATEGY -----------------
    if (!HigherBuyExecuted) {
      if (!HigherBuyOrderId && price > HigherBuyTrigger) {
        console.log("🔥 HIGHER BUY TRIGGER HIT → PLACING BUY");
        const orderResult = await placeLimitBuy(HigherBuyValue, HigherQuantity, SYMBOL);
        if (!orderResult) return price;
        HigherBuyOrderId = orderResult.orderId;
        console.log("📌 HIGHER BUY ORDER ID:", HigherBuyOrderId);
      }

      if (HigherBuyOrderId) {
        const orderDetails = await client.getOrder({ symbol: SYMBOL, orderId: HigherBuyOrderId });
        if (orderDetails.status === "FILLED" && !HigherOCOOrderData) {
          console.log("🎯 HIGHER BUY FILLED → PLACING OCO SELL");
          HigherOCOOrderData = await placeOCOSell(HigherQuantity, HigherSellValue, HigherStopLoss, HigherStopLoss, SYMBOL);
          HigherstopLossId = HigherOCOOrderData?.orderReports?.[0]?.orderId;
          HighertakeProfitId = HigherOCOOrderData?.orderReports?.[1]?.orderId;
        }
        if (HigherstopLossId && HighertakeProfitId) {
          const StopLossData = await client.getOrder({ symbol: SYMBOL, orderId: HigherstopLossId });
          const TakeProfitData = await client.getOrder({ symbol: SYMBOL, orderId: HighertakeProfitId });
          if (StopLossData.status === "FILLED" || TakeProfitData.status === "FILLED") {
            HigherBuyExecuted = true;
            console.log("🎉 HIGHER SELL COMPLETED → PROCESS DONE");
          }
        }
      }
    }

    return price;
  } catch (err) {
    console.error("❌ Price Fetch Error:", err.message || err);
    return null;
  }
}

// ----------------- PLACE LIMIT BUY -----------------
export async function placeLimitBuy(price, quantity, symbol) {
  try {
    if (!quantity || quantity <= 0) return null;
    const order = await client.order({
      symbol,
      side: "BUY",
      type: "LIMIT",
      timeInForce: "GTC",
      price: price.toString(),
      quantity: quantity.toString(),
      recvWindow: 60000,
    });
    console.log("✅ LIMIT BUY PLACED:", order);
    return order;
  } catch (err) {
    console.error("❌ BUY ERROR:", err.body || err.message);
    return null;
  }
}

// ----------------- PLACE LIMIT SELL -----------------
export async function placeLimitSell(price, quantity, symbol) {
  try {
    const order = await client.order({
      symbol,
      side: "SELL",
      type: "LIMIT",
      timeInForce: "GTC",
      price: price.toString(),
      quantity: quantity.toString(),
    });
    console.log("✅ LIMIT SELL PLACED:", order);
    return order;
  } catch (err) {
    console.error("❌ SELL ERROR:", err.body || err.message);
    return null;
  }
}

// ----------------- PLACE OCO SELL -----------------
export async function placeOCOSell(quantity, sellValue, stopPrice, stopLimitPrice, symbol) {
  try {
    const order = await client.orderOco({
      symbol,
      side: "SELL",
      quantity: quantity.toString(),
      price: sellValue.toString(),
      stopPrice: stopPrice.toString(),
      stopLimitPrice: stopLimitPrice.toString(),
      stopLimitTimeInForce: "GTC",
      recvWindow: 60000,
    });
    console.log("✅ OCO SELL PLACED:", order);
    return order;
  } catch (err) {
    console.error("❌ OCO ERROR:", err.body || err.message);
    return null;
  }
}
