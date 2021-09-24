import {
  getAllMarkets,
  getTokenBySymbol,
  MarketConfig,
  PerpMarket,
} from "@blockworks-foundation/mango-client";
import { Market } from "@project-serum/serum";
import Big from "big.js";
import { BadRequestError } from "dtos";
import { NextFunction, Request, Response, Router } from "express";
import { param, query, validationResult } from "express-validator";
import fetch from "node-fetch";
import { OrderInfo } from "types";
import Controller from "./controller.interface";
import MangoSimpleClient from "./mango.simple.client";
import { isValidMarket } from "./utils";

class MarketsController implements Controller {
  public path = "/api/markets";
  public router = Router();

  constructor(public mangoSimpleClient: MangoSimpleClient) {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    // GET /markets
    this.router.get(this.path, this.fetchMarkets);

    // GET /markets/{market_name}
    this.router.get(
      `${this.path}/:market_name`,
      param("market_name").custom(isValidMarket),
      this.fetchMarket
    );

    // GET /markets/{market_name}/orderbook?depth={depth}
    this.router.get(
      `${this.path}/:market_name/orderbook`,
      param("market_name").custom(isValidMarket),
      query("depth", "Depth should be a number between 20 and 100!")
        .optional()
        .isInt({ max: 100, min: 20 }),
      this.getOrderBook
    );

    // GET /markets/{market_name}/trades
    this.router.get(
      `${this.path}/:market_name/trades`,
      param("market_name").custom(isValidMarket),
      this.getTrades
    );

    // GET /markets/{market_name}/candles?resolution={resolution}&start_time={start_time}&end_time={end_time}
    this.router.get(
      `${this.path}/:market_name/candles`,
      param("market_name").custom(isValidMarket),
      this.getCandles
    );
  }

  private fetchMarkets = async (
    request: Request,
    response: Response,
    next: NextFunction
  ) => {
    response.send({
      success: true,
      result: await this.fetchMarketsInternal(),
    } as MarketsDto);
  };

  private fetchMarket = async (
    request: Request,
    response: Response,
    next: NextFunction
  ) => {
    const errors = validationResult(request);
    if (!errors.isEmpty()) {
      return response
        .status(400)
        .json({ errors: errors.array() as BadRequestError[] });
    }

    const marketName = request.params.market_name;
    response.send({
      success: true,
      result: await this.fetchMarketsInternal(marketName),
    } as MarketsDto);
  };

  private async fetchMarketsInternal(
    marketName?: string
  ): Promise<MarketDto[]> {
    let allMarketConfigs = getAllMarkets(
      this.mangoSimpleClient.mangoGroupConfig
    );

    if (marketName !== undefined) {
      allMarketConfigs = allMarketConfigs.filter(
        (marketConfig) => marketConfig.name === marketName
      );
    }

    const allMarkets = await this.mangoSimpleClient.fetchAllMarkets(marketName);

    return Promise.all(
      allMarketConfigs.map((marketConfig) =>
        this.computeMarketLatestDetails(marketConfig, allMarkets)
      )
    );
  }

  private async computeMarketLatestDetails(
    marketConfig: MarketConfig,
    allMarkets: Partial<Record<string, Market | PerpMarket>>
  ): Promise<MarketDto> {
    const market = allMarkets[marketConfig.publicKey.toBase58()];

    const [
      volume,
      change1h,
      change24h,
      changeBod,
      ordersInfo, // used for latest bid+ask
      tradesResponse, // used for latest trade+price
    ] = await Promise.all([
      getVolumeForMarket(marketConfig),
      getChange1H(marketConfig),
      getChange24H(marketConfig),
      getChangeBod(marketConfig),
      (await this.mangoSimpleClient.fetchAllBidsAndAsks(
        false,
        marketConfig.name
      )) as OrderInfo[][],
      fetch(
        `https://serum-history.herokuapp.com/trades/address/${marketConfig.publicKey.toBase58()}`
      ),
    ]);

    // latest bid+ask
    const bids = ordersInfo
      .flat()
      .filter((orderInfo) => orderInfo.order.side === "buy")
      .sort((b1, b2) => b2.order.price - b1.order.price);
    const asks = ordersInfo
      .flat()
      .filter((orderInfo) => orderInfo.order.side === "sell")
      .sort((a1, a2) => a1.order.price - a2.order.price);

    // latest trade+price
    const parsedTradesResponse = (await tradesResponse.json()) as any;
    let lastPrice;
    if ("s" in parsedTradesResponse && parsedTradesResponse["s"] === "error") {
      lastPrice = null;
    } else {
      lastPrice = parsedTradesResponse["data"][0]["price"];
    }

    // size increments
    let minOrderSize;
    if (market instanceof Market && market.minOrderSize) {
      minOrderSize = market.minOrderSize;
    } else if (market instanceof PerpMarket) {
      const token = getTokenBySymbol(
        this.mangoSimpleClient.mangoGroupConfig,
        marketConfig.baseSymbol
      );
      minOrderSize = new Big(market.baseLotSize.toString())
        .div(new Big(10).pow(token.decimals))
        .toNumber();
    }

    // price increment
    let tickSize = 1;
    if (market instanceof Market) {
      tickSize = market.tickSize;
    } else if (market instanceof PerpMarket) {
      const baseDecimals = getTokenBySymbol(
        this.mangoSimpleClient.mangoGroupConfig,
        marketConfig.baseSymbol
      ).decimals;
      const quoteDecimals = getTokenBySymbol(
        this.mangoSimpleClient.mangoGroupConfig,
        this.mangoSimpleClient.mangoGroupConfig.quoteSymbol
      ).decimals;

      const nativeToUi = new Big(10).pow(baseDecimals - quoteDecimals);
      const lotsToNative = new Big(market.quoteLotSize.toString()).div(
        new Big(market.baseLotSize.toString())
      );
      tickSize = lotsToNative.mul(nativeToUi).toNumber();
    }

    return {
      name: marketConfig.name,
      baseCurrency: marketConfig.baseSymbol,
      quoteCurrency: "USDC",
      quoteVolume24h: volume,
      change1h,
      change24h,
      changeBod,
      highLeverageFeeExempt: undefined,
      minProvideSize: undefined,
      type: marketConfig.name.includes("PERP") ? "futures" : "spot",
      underlying: marketConfig.baseSymbol,
      enabled: undefined,
      ask: asks.length > 0 ? asks[0].order.price : null,
      bid: bids.length > 0 ? bids[0].order.price : null,
      last: lastPrice,
      postOnly: undefined,
      price: lastPrice,
      priceIncrement: tickSize,
      sizeIncrement: minOrderSize,
      restricted: undefined,
      volumeUsd24h: volume,
    } as MarketDto;
  }

  private getOrderBook = async (
    request: Request,
    response: Response,
    next: NextFunction
  ) => {
    const errors = validationResult(request);
    if (!errors.isEmpty()) {
      return response
        .status(400)
        .json({ errors: errors.array() as BadRequestError[] });
    }

    const marketName = request.params.market_name;
    const depth = Number(request.query.depth) || 20;

    const ordersInfo = await this.mangoSimpleClient.fetchAllBidsAndAsks(
      false,
      marketName
    );
    const bids = ordersInfo
      .flat()
      .filter((orderInfo) => orderInfo.order.side === "buy")
      .sort((b1, b2) => b2.order.price - b1.order.price);
    const asks = ordersInfo
      .flat()
      .filter((orderInfo) => orderInfo.order.side === "sell")
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
    const errors = validationResult(request);
    if (!errors.isEmpty()) {
      return response
        .status(400)
        .json({ errors: errors.array() as BadRequestError[] });
    }

    const allMarketConfigs = getAllMarkets(
      this.mangoSimpleClient.mangoGroupConfig
    );
    const marketName = request.params.market_name;
    const marketPk = allMarketConfigs.filter(
      (marketConfig) => marketConfig.name === marketName
    )[0].publicKey;

    const tradesResponse = await fetch(
      `https://serum-history.herokuapp.com/trades/address/${marketPk.toBase58()}`
    );
    const parsedTradesResponse = (await tradesResponse.json()) as any;
    let tradeDtos;
    if ("s" in parsedTradesResponse && parsedTradesResponse["s"] === "error") {
      tradeDtos = [];
    } else {
      tradeDtos = parsedTradesResponse["data"].map((trade: any) => {
        return {
          id: trade["orderId"],
          liquidation: undefined,
          price: trade["price"],
          side: trade["side"],
          size: trade["size"],
          time: new Date(trade["time"]),
        } as TradeDto;
      });
    }

    response.send({ success: true, result: tradeDtos } as TradesDto);
  };

  private getCandles = async (
    request: Request,
    response: Response,
    next: NextFunction
  ) => {
    const errors = validationResult(request);
    if (!errors.isEmpty()) {
      return response
        .status(400)
        .json({ errors: errors.array() as BadRequestError[] });
    }

    const marketName = request.params.market_name;
    const resolution = String(request.query.resolution);
    const fromEpochS = Number(request.query.start_time);
    const toEpochS = Number(request.query.end_time);

    const { t, o, h, l, c, v } = await getOhlcv(
      marketName,
      resolution,
      fromEpochS,
      toEpochS
    );

    const ohlcvDtos: OhlcvDto[] = [];
    for (let i = 0; i < t.length; i++) {
      ohlcvDtos.push({
        time: t[i],
        open: o[i],
        high: h[i],
        low: l[i],
        close: c[i],
        volume: v[i],
      } as OhlcvDto);
    }

    response.send({ success: true, result: ohlcvDtos } as OhlcvsDto);
  };
}

export default MarketsController;

/// helper functions

async function getChange24H(marketConfig: MarketConfig): Promise<number> {
  const fromS =
    new Date(new Date().getTime() - 24 * 60 * 60 * 1000).getTime() / 1000;
  const toS = new Date(new Date().getTime()).getTime() / 1000;
  const { t, o, h, l, c, v } = await getOhlcv(
    marketConfig.name,
    "1D",
    fromS,
    toS
  );
  return c ? (c[0] - o[0]) / o[0] : undefined;
}

async function getChange1H(marketConfig: MarketConfig): Promise<number> {
  const fromS =
    new Date(new Date().getTime() - 60 * 60 * 1000).getTime() / 1000;
  const toS = new Date(new Date().getTime()).getTime() / 1000;
  const { t, o, h, l, c, v } = await getOhlcv(
    marketConfig.name,
    "60",
    fromS,
    toS
  );
  return c ? (c[0] - o[0]) / o[0] : undefined;
}

async function getChangeBod(marketConfig: MarketConfig): Promise<number> {
  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  const fromS = from.getTime() / 1000;
  const to = new Date();
  const toS = to.getTime() / 1000;
  const { t, o, h, l, c, v } = await getOhlcv(
    marketConfig.name,
    "1",
    fromS,
    toS
  );
  // todo double check this
  return c ? (c[0] - o[o.length - 1]) / o[o.length - 1] : undefined;
}

async function getOhlcv(
  market: string,
  resolution: string,
  fromS: number,
  toS: number
) {
  const historyResponse = await fetch(
    `https://serum-history.herokuapp.com/tv/history` +
      `?symbol=${market}&resolution=${resolution}&from=${fromS}&to=${toS}`
  );
  return historyResponse.json();
}

export async function getVolumeForMarket(
  marketConfig: MarketConfig
): Promise<Number> {
  const perpVolume = await fetch(
    `https://event-history-api.herokuapp.com/stats/perps/${marketConfig.publicKey.toBase58()}`
  );
  const parsedPerpVolume = await perpVolume.json();
  return Number(parsedPerpVolume?.data?.volume);
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
