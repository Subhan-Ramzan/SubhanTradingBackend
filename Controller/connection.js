
import pkg from "binance-api-node";
const Binance = pkg.default; // agar Node v22 ES modules me use ho
import dotenv from "dotenv";

dotenv.config();

const SYMBOL = process.env.SYMBOL || "BTCUSDT";

const client = Binance({
  apiKey: process.env.BINANCE_KEY || "",
  apiSecret: process.env.BINANCE_SECRET || "",
});

// async function fetchPriceOnce(returnPriceOnly = false) {
//   try {
//     const prices = await client.prices({ symbol: SYMBOL });
//     const price = prices[SYMBOL];
    
//     // console.log(`new price is ${price}`);
//     // if (returnPriceOnly) console.log(`${SYMBOL} price =`, price);
//     return price;
//   } catch (error) {
//     console.error("Error fetching price:", err.message || err);
//     return null;
//   }
// }

// export default fetchPriceOnce;
