import Controller from "./controller.interface";
import MangoSimpleClient from "./mango.simple.client";
import {
  BookSide,
  BookSideLayout,
  getAllMarkets,
  MarketConfig,
  PerpMarket,
  PerpOrder,
} from "@blockworks-foundation/mango-client";
import { Market, Orderbook } from "@project-serum/serum";
import { Order } from "@project-serum/serum/lib/market";
import { AccountInfo } from "@solana/web3.js";
import { NextFunction, Request, Response, Router } from "express";

class MarketsController implements Controller {
  public path = "/markets";
  public router = Router();

  constructor(public mangoMarkets: MangoSimpleClient) {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    // GET /markets
    this.router.get(this.path, this.getMarkets);

    // todo GET /markets/{market_name}

    // GET /markets/{market_name}/orderbook?depth={depth}
    this.router.get(`${this.path}/:market_name/orderbook`, this.getOrderBook);

    // GET /markets/{market_name}/trades
    this.router.get(`${this.path}/:market_name/trades`, this.getTrades);

    // GET /markets/{market_name}/candles?resolution={resolution}&start_time={start_time}&end_time={end_time}
    this.router.get(`${this.path}/:market_name/candles`, this.getCandles);
  }

  private getMarkets = async (
    request: Request,
    response: Response,
    next: NextFunction
  ) => {
    let allMarketConfigs = getAllMarkets(this.mangoMarkets.mangoGroupConfig);

    const marketDtos = [];
    for (const marketConfig of allMarketConfigs) {
      marketDtos.push({
        name: marketConfig.name,
        baseCurrency: marketConfig.baseSymbol,
        quoteCurrency: "USDC",
        quoteVolume24h: await getVolumeForMarket(marketConfig),
        change1h: undefined,
        change24h: undefined,
        changeBod: undefined,
        highLeverageFeeExempt: undefined,
        minProvideSize: undefined,
        type: marketConfig.name.includes("PERP") ? "futures" : "spot",
        underlying: marketConfig.baseSymbol,
        enabled: undefined,
        ask: undefined,
        bid: undefined,
        last: undefined,
        postOnly: undefined,
        price: undefined,
        priceIncrement: undefined,
        sizeIncrement: undefined,
        restricted: undefined,
        volumeUsd24h: await getVolumeForMarket(marketConfig),
      } as MarketDto);
    }
    response.send({ success: true, result: marketDtos } as MarketsDto);
  };

  private getOrderBook = async (
    request: Request,
    response: Response,
    next: NextFunction
  ) => {
    let marketName = request.params.market_name;
    const depth = Number(request.query.depth) || 20;

    const ordersInfo = await this.mangoMarkets.getAllBidsAndAsks(
      false,
      marketName
    );
    let bids = ordersInfo
      .flat()
      .filter((orderInfo) => orderInfo.order.side == "buy")
      .sort((b1, b2) => b2.order.price - b1.order.price);
    let asks = ordersInfo
      .flat()
      .filter((orderInfo) => orderInfo.order.side == "sell")
      .sort((a1, a2) => a1.order.price - a2.order.price);

    response.send({
      success: true,
      result: {
        asks: asks
          .slice(0, depth)
          .map((ask) => [ask.order.price, ask.order.size]),
        bids: bids
          .slice(0, depth)
          .map((bid) => [bid.order.price, bid.order.size]),
      },
    } as OrdersDto);
  };

  private getTrades = async (
    request: Request,
    response: Response,
    next: NextFunction
  ) => {
    const allMarketConfigs = getAllMarkets(this.mangoMarkets.mangoGroupConfig);
    const marketName = request.params.market_name;
    const marketPk = allMarketConfigs
      .filter((marketConfig) => marketConfig.name === marketName)[0]
      .publicKey.toBase58();

    const tradesResponse = await fetch(
      `https://serum-history.herokuapp.com/trades/address/${marketPk}`
    );
    const parsedTradesResponse = tradesResponse.json() as any;
    const tradeDtos = parsedTradesResponse["data"].map((trade: any) => {
      return {
        id: trade["orderId"],
        liquidation: undefined,
        price: trade["price"],
        side: trade["side"],
        size: trade["size"],
        time: new Date(trade["time"]),
      } as TradeDto;
    });

    response.send({ success: true, result: tradeDtos } as TradesDto);
  };

  private getCandles = async (
    request: Request,
    response: Response,
    next: NextFunction
  ) => {
    const marketName = request.params.market_name;
    const resolution = request.query.resolution;
    const fromEpochS = request.query.start_time;
    const toEpochS = request.query.end_time;

    const historyResponse = await fetch(
      `https://serum-history.herokuapp.com/tv/history` +
        `?symbol=${marketName}&resolution=${resolution}` +
        `&from=${fromEpochS}&to=${toEpochS}`
    );
    const { time, open, high, low, close, volume } =
      (await historyResponse.json()) as any;

    const ohlcvDtos: OhlcvDto[] = [];
    for (let i = 0; i < time.length; i++) {
      ohlcvDtos.push({
        time: time[i],
        open: open[i],
        high: high[i],
        low: low[i],
        close: close[i],
        volume: volume[i],
      } as OhlcvDto);
    }

    response.send({ success: true, result: ohlcvDtos } as OhlcvsDto);
  };
}

export default MarketsController;

/// helper functions

export async function getVolumeForMarket(marketConfig: MarketConfig) {
  const perpVolume = await fetch(
    `https://event-history-api.herokuapp.com/stats/perps/${marketConfig.publicKey.toString()}`
  );
  const parsedPerpVolume = await perpVolume.json();
  return parsedPerpVolume?.data?.volume;
}

export function parseSpotOrders(
  market: Market,
  config: MarketConfig,
  accountInfos: { [key: string]: AccountInfo<Buffer> }
): { bids: Order[]; asks: Order[] } {
  const bidData = accountInfos[market["_decoded"].bids.toBase58()]?.data;
  const askData = accountInfos[market["_decoded"].asks.toBase58()]?.data;

  const bidOrderBook =
    market && bidData ? Orderbook.decode(market, bidData) : ([] as Order[]);
  const askOrderBook =
    market && askData ? Orderbook.decode(market, askData) : ([] as Order[]);

  return { bids: [...bidOrderBook], asks: [...askOrderBook] };
}

export function parsePerpOpenOrders(
  market: PerpMarket,
  config: MarketConfig,
  accountInfos: { [key: string]: AccountInfo<Buffer> }
): { bids: PerpOrder[]; asks: PerpOrder[] } {
  const bidData = accountInfos[market.bids.toBase58()]?.data;
  const askData = accountInfos[market.asks.toBase58()]?.data;

  const bidOrderBook =
    market && bidData
      ? new BookSide(market.bids, market, BookSideLayout.decode(bidData))
      : ([] as PerpOrder[]);
  const askOrderBook =
    market && askData
      ? new BookSide(market.asks, market, BookSideLayout.decode(askData))
      : ([] as PerpOrder[]);

  return { bids: [...bidOrderBook], asks: [...askOrderBook] };
}

/// Dtos

// e.g.
// {
//   "success": true,
//   "result": [
//     {
//       "name": "BTC-0628",
//       "baseCurrency": null,
//       "quoteCurrency": null,
//       "quoteVolume24h": 28914.76,
//       "change1h": 0.012,
//       "change24h": 0.0299,
//       "changeBod": 0.0156,
//       "highLeverageFeeExempt": false,
//       "minProvideSize": 0.001,
//       "type": "future",
//       "underlying": "BTC",
//       "enabled": true,
//       "ask": 3949.25,
//       "bid": 3949,
//       "last": 3949.00,
//       "postOnly": false,
//       "price": 10579.52,
//       "priceIncrement": 0.25,
//       "sizeIncrement": 0.0001,
//       "restricted": false,
//       "volumeUsd24h": 28914.76
//     }
//   ]
// }

interface MarketsDto {
  success: boolean;
  result: MarketDto[];
}

interface MarketDto {
  name: string;
  baseCurrency: string;
  quoteCurrency: string;
  quoteVolume24h: number;
  change1h: number;
  change24h: number;
  changeBod: number;
  highLeverageFeeExempt: boolean;
  minProvideSize: number;
  type: string;
  underlying: string;
  enabled: boolean;
  ask: number;
  bid: number;
  last: number;
  postOnly: boolean;
  price: number;
  priceIncrement: number;
  sizeIncrement: number;
  restricted: boolean;
  volumeUsd24h: number;
}

// e.g.
// {
//   "success": true,
//   "result": {
//     "asks": [
//       [
//         4114.25,
//         6.263
//       ]
//     ],
//     "bids": [
//       [
//         4112.25,
//         49.29
//       ]
//     ]
//   }
// }
interface OrdersDto {
  success: boolean;
  result: {
    asks: number[][];
    bids: number[][];
  };
}

// e.g.
// {
//   "success": true,
//   "result": [
//     {
//       "id": 3855995,
//       "liquidation": false,
//       "price": 3857.75,
//       "side": "buy",
//       "size": 0.111,
//       "time": "2019-03-20T18:16:23.397991+00:00"
//     }
//   ]
// }

interface TradesDto {
  success: boolean;
  result: TradeDto[];
}

interface TradeDto {
  id: string;
  liquidation: boolean;
  price: number;
  side: string;
  size: number;
  time: Date;
}

// e.g.
// {
//   "success": true,
//   "result": [
//     {
//       "close": 11055.25,
//       "high": 11089.0,
//       "low": 11043.5,
//       "open": 11059.25,
//       "startTime": "2019-06-24T17:15:00+00:00",
//       "volume": 464193.95725
//     }
//   ]
// }

interface OhlcvsDto {
  success: boolean;
  result: OhlcvDto[];
}

interface OhlcvDto {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
