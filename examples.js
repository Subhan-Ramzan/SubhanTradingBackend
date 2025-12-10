// /*
// connection.js

// Node.js script for Binance Spot that implements the XPL buy/sell logic you requested.

// Features:
// - Watches market price for symbol XPLUSDT (change symbol if different)
// - Buys when price >= 0.2250 OR price <= 0.2150 (both triggers active simultaneously)
// - After a buy at 0.2150 -> places a sell limit at 0.2200
// - After a buy at 0.2250 -> places a sell limit at 0.2450
// - Keeps the 0.2250 buy trigger active even if 0.2150 buy executed and sold
// - Persists traded positions & active triggers in local JSON for basic reliability

// IMPORTANT SAFETY & SETUP NOTES:
// - This will place real orders on Binance if you provide real API keys. Use Binance TESTNET first.
// - Install dependencies: npm i binance-api-node dotenv fs-extra
// - Create a .env file with:
//     BINANCE_KEY=your_api_key
//     BINANCE_SECRET=your_api_secret
//     SYMBOL=XPLUSDT      # change if pair differs
//     BASE_ORDER_USDT=20  # example quote amount to buy per buy signal
//     USE_TESTNET=false   # set true to use Binance Spot Testnet (if supported by your client)

// Run: node connection.js

// This file is intentionally straightforward so you can read & adapt it.
// */

// import fs from 'fs-extra';
// import path from 'path';
// import Binance from 'binance-api-node';
// import dotenv from 'dotenv';

// dotenv.config();

// const DATA_FILE = path.join(process.cwd(), 'bot_state.json');

// const SYMBOL = process.env.SYMBOL || 'XPLUSDT';
// const BASE_ORDER_USDT = Number(process.env.BASE_ORDER_USDT || '20');
// const USE_TESTNET = (process.env.USE_TESTNET || 'false') === 'true';

// const BUY_TRIGGER_LOW = 0.2150;   // buy when price <= this
// const BUY_TRIGGER_HIGH = 0.2250;  // buy when price >= this
// const SELL_TARGET_AFTER_LOW_BUY = 0.2200; // sell target if bought at/near low
// const SELL_TARGET_AFTER_HIGH_BUY = 0.2450; // sell target if bought at/near high

// // --- Persistence helpers --------------------------------------------------
// function loadState() {
//   try {
//     if (fs.existsSync(DATA_FILE)) return fs.readJsonSync(DATA_FILE);
//   } catch (e) {
//     console.error('Failed to read state:', e.message);
//   }
//   const init = {
//     triggers: {
//       lowBuyActive: true,   // 0.2150 trigger active
//       highBuyActive: true,  // 0.2250 trigger active
//     },
//     positions: [] // {id, buyPrice, buyQty, triggerType: 'low'|'high', sellOrderId?, sellPrice, status: 'open'|'sold' }
//   };
//   fs.writeJsonSync(DATA_FILE, init, {spaces:2});
//   return init;
// }

// function saveState(state) {
//   fs.writeJsonSync(DATA_FILE, state, {spaces:2});
// }

// let state = loadState();

// // --- Binance client ------------------------------------------------------
// const client = Binance({
//   apiKey: process.env.BINANCE_KEY || '',
//   apiSecret: process.env.BINANCE_SECRET || '',
//   // Note: binance-api-node chooses endpoints automatically. For testnet, user might need a different client or url.
// });

// // --- Utility -------------------------------------------------------------
// function now() { return new Date().toISOString(); }

// async function getPrice() {
//   try {
//     const prices = await client.prices({ symbol: SYMBOL });
//     const p = Number(prices[SYMBOL]);
//     return p;
//   } catch (e) {
//     console.error(now(), 'getPrice error', e.message);
//     return null;
//   }
// }

// // Cancel helper (for completeness) ------------------------------------------------
// async function cancelOrderIfExists(orderId) {
//   try {
//     if (!orderId) return;
//     await client.cancelOrder({ symbol: SYMBOL, orderId });
//   } catch (e) {
//     // ignore not found
//   }
// }

// // --- Trading logic ------------------------------------------------------

// // Place a market buy using quoteOrderQty (buy $ amount of the quote asset USDT)
// async function placeMarketBuy(quoteSizeUsd) {
//   try {
//     const order = await client.order({
//       symbol: SYMBOL,
//       side: 'BUY',
//       type: 'MARKET',
//       quoteOrderQty: quoteSizeUsd.toString(),
//     });
//     return order; // contains executedQty, cummulativeQuoteQty, fills etc
//   } catch (e) {
//     console.error(now(), 'Market buy failed:', e.message);
//     return null;
//   }
// }

// // Place a limit sell order
// async function placeLimitSell(quantity, price) {
//   try {
//     const order = await client.order({
//       symbol: SYMBOL,
//       side: 'SELL',
//       type: 'LIMIT',
//       timeInForce: 'GTC',
//       quantity: quantity.toString(),
//       price: price.toFixed(8).replace(/\.?0+$/,'') // format without trailing zeros
//     });
//     return order;
//   } catch (e) {
//     console.error(now(), 'Limit sell failed:', e.message);
//     return null;
//   }
// }

// // Track new executed market buy and create appropriate sell limit
// async function handleExecutedBuy(orderResult, triggerType) {
//   // orderResult from placeMarketBuy
//   // determine executed price and quantity
//   if (!orderResult) return;

//   // Some clients return fills array; compute avg price and qty
//   let fills = orderResult.fills || [];
//   let qty = 0, quote = 0;
//   if (fills.length) {
//     for (const f of fills) {
//       qty += Number(f.qty);
//       quote += Number(f.qty) * Number(f.price);
//     }
//   } else {
//     // fallback: orderResult.executedQty and cummulativeQuoteQty
//     qty = Number(orderResult.executedQty || 0);
//     quote = Number(orderResult.cummulativeQuoteQty || 0);
//   }
//   if (qty === 0) {
//     console.warn(now(), 'Bought but qty is 0, skipping');
//     return;
//   }
//   const avgBuyPrice = quote / qty;

//   const pos = {
//     id: Date.now().toString(),
//     buyPrice: avgBuyPrice,
//     buyQty: qty,
//     triggerType, // 'low' or 'high'
//     sellOrderId: null,
//     sellPrice: null,
//     status: 'open',
//     createdAt: now()
//   };

//   // Decide sell target based on triggerType
//   let sellTarget = (triggerType === 'low') ? SELL_TARGET_AFTER_LOW_BUY : SELL_TARGET_AFTER_HIGH_BUY;
//   pos.sellPrice = sellTarget;

//   // Place sell limit for the same quantity
//   const sellOrder = await placeLimitSell(pos.buyQty, sellTarget);
//   if (sellOrder && sellOrder.orderId) {
//     pos.sellOrderId = sellOrder.orderId;
//     state.positions.push(pos);
//     saveState(state);
//     console.log(now(), `Placed sell limit @ ${sellTarget} for qty ${pos.buyQty}, posId=${pos.id}`);
//   } else {
//     console.error(now(), 'Failed to place sell order; saving position without sellOrderId');
//     state.positions.push(pos);
//     saveState(state);
//   }
// }

// // Core check function called periodically
// let lastPrice = null;

// async function checkAndAct() {
//   const price = await getPrice();
//   if (!price) return;
//   lastPrice = price;
//   console.log(now(), SYMBOL, 'price=', price.toFixed(8));

//   // Trigger low buy (<= 0.2150)
//   if (state.triggers.lowBuyActive && price <= BUY_TRIGGER_LOW) {
//     // To avoid repeated buys every tick, check if a recent position was created by the low trigger
//     const recentLow = state.positions.find(p => p.triggerType === 'low' && p.status === 'open');
//     if (!recentLow) {
//       console.log(now(), `Price ${price} <= ${BUY_TRIGGER_LOW}: placing LOW market buy ($${BASE_ORDER_USDT})`);
//       const orderRes = await placeMarketBuy(BASE_ORDER_USDT);
//       await handleExecutedBuy(orderRes, 'low');
//     } else {
//       // already have an open position from low trigger
//     }
//   }

//   // Trigger high buy (>= 0.2250)
//   if (state.triggers.highBuyActive && price >= BUY_TRIGGER_HIGH) {
//     const recentHigh = state.positions.find(p => p.triggerType === 'high' && p.status === 'open');
//     if (!recentHigh) {
//       console.log(now(), `Price ${price} >= ${BUY_TRIGGER_HIGH}: placing HIGH market buy ($${BASE_ORDER_USDT})`);
//       const orderRes = await placeMarketBuy(BASE_ORDER_USDT);
//       await handleExecutedBuy(orderRes, 'high');
//     } else {
//       // already have an open position from high trigger
//     }
//   }

//   // Check open positions for filled sell orders and update state
//   await refreshPositions();
// }

// // Poll sell orders to see if filled (simple implementation)
// async function refreshPositions() {
//   for (const pos of state.positions) {
//     if (pos.status !== 'open') continue;
//     if (!pos.sellOrderId) continue;
//     try {
//       const orderStatus = await client.getOrder({ symbol: SYMBOL, orderId: pos.sellOrderId });
//       if (orderStatus && orderStatus.status === 'FILLED') {
//         pos.status = 'sold';
//         pos.soldAt = now();
//         pos.soldPrice = Number(orderStatus.fills && orderStatus.fills.length ? orderStatus.fills.reduce((a,f)=>a+Number(f.price)*Number(f.qty),0)/orderStatus.executedQty : orderStatus.price);
//         console.log(now(), `Position ${pos.id} sold at ${pos.soldPrice}`);
//         saveState(state);
//       }
//     } catch (e) {
//       // console.error('refreshPositions err', e.message);
//     }
//   }
// }

// // --- CLI / Small API to manage triggers ---------------------------------
// function enableLowTrigger() { state.triggers.lowBuyActive = true; saveState(state); }
// function disableLowTrigger() { state.triggers.lowBuyActive = false; saveState(state); }
// function enableHighTrigger() { state.triggers.highBuyActive = true; saveState(state); }
// function disableHighTrigger() { state.triggers.highBuyActive = false; saveState(state); }

// // --- Start loop ---------------------------------------------------------

// console.log('Bot starting. Symbol=', SYMBOL, 'Base order USD=', BASE_ORDER_USDT);
// console.log('Triggers: low=', BUY_TRIGGER_LOW, 'high=', BUY_TRIGGER_HIGH);

// // Run check every 5 seconds (adjust as you like)
// setInterval(checkAndAct, 5000);

// // Also run immediately
// checkAndAct();

// // Simple process stdin commands so you can manage triggers at runtime
// process.stdin.setEncoding('utf8');
// console.log('\nCommands: low_on, low_off, high_on, high_off, status, exit\n');
// process.stdin.on('data', async (data) => {
//   const cmd = data.toString().trim();
//   if (cmd === 'low_on') { enableLowTrigger(); console.log('low trigger enabled'); }
//   else if (cmd === 'low_off') { disableLowTrigger(); console.log('low trigger disabled'); }
//   else if (cmd === 'high_on') { enableHighTrigger(); console.log('high trigger enabled'); }
//   else if (cmd === 'high_off') { disableHighTrigger(); console.log('high trigger disabled'); }
//   else if (cmd === 'status') { console.log(JSON.stringify(state, null, 2)); }
//   else if (cmd === 'exit') { console.log('Exiting'); process.exit(0); }
//   else console.log('Unknown command');
// });


















// tradeLogic.js
import { client } from "./binanceClient.js";
import { CONFIG } from "./config.js";
import { loadState, saveState } from "./stateManager.js";

let state = loadState();

function now() { return new Date().toISOString(); }

export async function getPrice() {
  try {
    const prices = await client.prices({ symbol: CONFIG.SYMBOL });
    return Number(prices[CONFIG.SYMBOL]);
  } catch {
    return null;
  }
}

async function placeMarketBuy(usdAmount) {
  try {
    return await client.order({
    symbol: CONFIG.SYMBOL,
    side: "BUY",
    type: "MARKET",
    quoteOrderQty: usdAmount.toString(),
    });
  } catch (e) {
    console.log("Buy Error:", e.message);
    return null;
  }
}

async function placeLimitSell(qty, price) {
  try {
    return await client.order({
    symbol: CONFIG.SYMBOL,
    side: "SELL",
    type: "LIMIT",
    timeInForce: "GTC",
    quantity: qty.toString(),
    price: price.toString(),
    });
  } catch (e) {
    console.log("Sell Error:", e.message);
    return null;
  }
}

async function handleExecutedBuy(orderResult, type) {
  if (!orderResult) return;

  let qty = Number(orderResult.executedQty || 0);
  let avg = Number(orderResult.cummulativeQuoteQty) / qty;

  let target =
    type === "low"
      ? CONFIG.SELL_TARGET_AFTER_LOW_BUY
      : CONFIG.SELL_TARGET_AFTER_HIGH_BUY;

  const sell = await placeLimitSell(qty, target);

  state.positions.push({
    id: Date.now().toString(),
    buyQty: qty,
    buyPrice: avg,
    sellPrice: target,
    sellOrderId: sell?.orderId || null,
    status: "open",
    triggerType: type,
  });

  saveState(state);
}

async function refreshPositions() {
  for (const pos of state.positions) {
    if (pos.status !== "open") continue;
    if (!pos.sellOrderId) continue;

    const res = await client.getOrder({
      symbol: CONFIG.SYMBOL,
      orderId: pos.sellOrderId,
    });

    if (res.status === "FILLED") {
      pos.status = "sold";
      saveState(state);
    }
  }
}

export async function checkAndAct() {
  const price = await getPrice();
  if (!price) return;

  console.log(now(), "PRICE:", price);

  // LOW BUY (<= 0.2150)
  if (state.triggers.lowBuyActive && price <= CONFIG.BUY_TRIGGER_LOW) {
    const exist = state.positions.find(
      p => p.triggerType === "low" && p.status === "open"
    );
    if (!exist) {
      const order = await placeMarketBuy(CONFIG.BASE_ORDER_USDT);
      await handleExecutedBuy(order, "low");
    }
  }

  // HIGH BUY (>= 0.2250)
  if (state.triggers.highBuyActive && price >= CONFIG.BUY_TRIGGER_HIGH) {
    const exist = state.positions.find(
      p => p.triggerType === "high" && p.status === "open"
    );
    if (!exist) {
      const order = await placeMarketBuy(CONFIG.BASE_ORDER_USDT);
      await handleExecutedBuy(order, "high");
    }
  }

  await refreshPositions();
}
