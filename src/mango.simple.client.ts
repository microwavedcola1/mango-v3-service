import { zipDict } from "./utils";
import {
  Config,
  getAllMarkets,
  getMarketByPublicKey,
  getMultipleAccounts,
  GroupConfig,
  MangoClient,
  MangoGroup,
  PerpMarketLayout,
  MarketConfig,
  MangoAccount,
  PerpMarket,
  BookSide,
  BookSideLayout,
  PerpOrder,
  getMarketByBaseSymbolAndKind,
} from "@blockworks-foundation/mango-client";
import { Market, Orderbook } from "@project-serum/serum";
import { Order } from "@project-serum/serum/lib/market";
import { Account, Commitment, Connection } from "@solana/web3.js";
import { AccountInfo, PublicKey } from "@solana/web3.js";
import fs from "fs";
import os from "os";
import { OrderInfo } from "types";

class MangoSimpleClient {
  constructor(
    public mangoGroupConfig: GroupConfig,
    public connection: Connection,
    public client: MangoClient,
    // todo: load/reload/cache markets often
    public mangoGroup: MangoGroup,
    public owner: Account,
    // todo: load/reload/cache mangoAccount and various load* methods often
    public mangoAccount: MangoAccount
  ) {}

  static async create() {
    const groupName = process.env.GROUP || "devnet.1";
    const mangoGroupConfig: GroupConfig = Config.ids().groups.filter(
      (group) => group.name == groupName
    )[0];

    const connection = new Connection(
      process.env.CLUSTER_URL || "https://api.devnet.solana.com",
      "processed" as Commitment
    );

    const mangoClient = new MangoClient(
      connection,
      mangoGroupConfig.mangoProgramId
    );

    const mangoGroup = await mangoClient.getMangoGroup(
      mangoGroupConfig.publicKey
    );

    const user = new Account(
      JSON.parse(
        process.env.KEYPAIR ||
          fs.readFileSync(
            os.homedir() + "/.config/solana/mainnet.json",
            "utf-8"
          )
      )
    );

    const mangoAccounts = await mangoClient.getMangoAccountsForOwner(
      mangoGroup,
      user.publicKey
    );
    if (!mangoAccounts.length) {
      throw new Error(`No mango account found ${user.publicKey.toBase58()}`);
    }

    const sortedMangoAccounts = mangoAccounts
      .slice()
      .sort((a, b) =>
        a.publicKey.toBase58() > b.publicKey.toBase58() ? 1 : -1
      );

    return new MangoSimpleClient(
      // todo: these things might get stale as time goes
      mangoGroupConfig,
      connection,
      mangoClient,
      mangoGroup,
      user,
      sortedMangoAccounts[0]
    );
  }

  ///

  public async getAllMarkets(
    onlyMarket?: string
  ): Promise<Partial<Record<string, Market | PerpMarket>>> {
    let allMarketConfigs = getAllMarkets(this.mangoGroupConfig);
    let allMarketPks = allMarketConfigs.map((m) => m.publicKey);

    if (onlyMarket !== undefined) {
      allMarketConfigs = allMarketConfigs.filter(
        (marketConfig) => marketConfig.name === onlyMarket
      );
      allMarketPks = allMarketConfigs.map((m) => m.publicKey);
    }

    const allMarketAccountInfos = await getMultipleAccounts(
      this.connection,
      allMarketPks
    );

    const allMarketAccounts = allMarketConfigs.map((config, i) => {
      if (config.kind == "spot") {
        const decoded = Market.getLayout(
          this.mangoGroupConfig.mangoProgramId
        ).decode(allMarketAccountInfos[i].accountInfo.data);
        return new Market(
          decoded,
          config.baseDecimals,
          config.quoteDecimals,
          undefined,
          this.mangoGroupConfig.serumProgramId
        );
      }
      if (config.kind == "perp") {
        const decoded = PerpMarketLayout.decode(
          allMarketAccountInfos[i].accountInfo.data
        );
        return new PerpMarket(
          config.publicKey,
          config.baseDecimals,
          config.quoteDecimals,
          decoded
        );
      }
    });

    return zipDict(
      allMarketPks.map((pk) => pk.toBase58()),
      allMarketAccounts
    );
  }

  public async getAllBidsAndAsks(
    filterForMangoAccount: boolean = false,
    onlyMarket?: string
  ): Promise<OrderInfo[][]> {
    this.mangoAccount.loadOpenOrders(
      this.connection,
      new PublicKey(this.mangoGroupConfig.serumProgramId)
    );

    let allMarketConfigs = getAllMarkets(this.mangoGroupConfig);
    let allMarketPks = allMarketConfigs.map((m) => m.publicKey);

    if (onlyMarket !== undefined) {
      allMarketConfigs = allMarketConfigs.filter(
        (marketConfig) => marketConfig.name === onlyMarket
      );
      allMarketPks = allMarketConfigs.map((m) => m.publicKey);
    }

    const allBidsAndAsksPks = allMarketConfigs
      .map((m) => [m.bidsKey, m.asksKey])
      .flat();
    const allBidsAndAsksAccountInfos = await getMultipleAccounts(
      this.connection,
      allBidsAndAsksPks
    );

    const accountInfos: { [key: string]: AccountInfo<Buffer> } = {};
    allBidsAndAsksAccountInfos.forEach(
      ({ publicKey, context, accountInfo }) => {
        accountInfos[publicKey.toBase58()] = accountInfo;
      }
    );

    const markets = await this.getAllMarkets(onlyMarket);

    return Object.entries(markets).map(([address, market]) => {
      const marketConfig = getMarketByPublicKey(this.mangoGroupConfig, address);
      if (market instanceof Market) {
        return this.parseSpotOrders(
          market,
          marketConfig,
          accountInfos,
          filterForMangoAccount ? this.mangoAccount : undefined
        );
      } else if (market instanceof PerpMarket) {
        return this.parsePerpOpenOrders(
          market,
          marketConfig,
          accountInfos,
          filterForMangoAccount ? this.mangoAccount : undefined
        );
      }
    });
  }

  public async getAllFills(
    filterForMangoAccount: boolean = false
  ): Promise<any[]> {
    let allMarketConfigs = getAllMarkets(this.mangoGroupConfig);
    const allMarkets = await this.getAllMarkets();

    let mangoAccountFills: any[] = [];

    allMarketConfigs.map((config, i) => {
      if (config.kind == "spot") {
        const openOrdersAccount =
          this.mangoAccount.spotOpenOrdersAccounts[config.marketIndex];
        const mangoAccountFills_ = allMarkets[config.publicKey.toBase58()]
          // todo: what if we want to fetch the 10001 position?
          .loadFills(this.connection, 10000)
          .then((fills) => {
            if (filterForMangoAccount) {
              fills = fills.filter((fill) => {
                return openOrdersAccount?.publicKey
                  ? fill.openOrders.equals(openOrdersAccount?.publicKey)
                  : false;
              });
            }
            return fills.map((fill) => ({ ...fill, marketName: config.name }));
          });
        mangoAccountFills = mangoAccountFills.concat(mangoAccountFills_);
      }
      if (config.kind == "perp") {
        const mangoAccountFills_ = allMarkets[config.publicKey.toBase58()]
          .loadFills(this.connection)
          .then((fills) => {
            if (filterForMangoAccount) {
              fills = fills.filter(
                (fill) =>
                  fill.taker.equals(this.mangoAccount.publicKey) ||
                  fill.maker.equals(this.mangoAccount.publicKey)
              );
            }
            return fills.map((fill) => ({ ...fill, marketName: config.name }));
          });
        mangoAccountFills = mangoAccountFills.concat(mangoAccountFills_);
      }
    });

    return mangoAccountFills;
  }

  public async placeOrder(
    market: string,
    type: "market" | "limit",
    side: "buy" | "sell",
    quantity: number,
    price?: number,
    orderType: "ioc" | "postOnly" | "limit" = "limit"
  ): Promise<void> {
    if (type === "market") {
      throw new Error("Not implemented!");
    }

    if (market.includes("PERP")) {
      const perpMarketConfig = getMarketByBaseSymbolAndKind(
        this.mangoGroupConfig,
        market.split("/")[0],
        "perp"
      );
      const perpMarket = await this.mangoGroup.loadPerpMarket(
        this.connection,
        perpMarketConfig.marketIndex,
        perpMarketConfig.baseDecimals,
        perpMarketConfig.quoteDecimals
      );
      await this.client.placePerpOrder(
        this.mangoGroup,
        this.mangoAccount,
        this.mangoGroup.mangoCache,
        perpMarket,
        this.owner,
        side,
        price,
        quantity,
        orderType
      );
    } else {
      const spotMarketConfig = getMarketByBaseSymbolAndKind(
        this.mangoGroupConfig,
        market.split("/")[0],
        "spot"
      );
      const spotMarket = await Market.load(
        this.connection,
        spotMarketConfig.publicKey,
        undefined,
        this.mangoGroupConfig.serumProgramId
      );
      await this.client.placeSpotOrder(
        this.mangoGroup,
        this.mangoAccount,
        this.mangoGroup.mangoCache,
        spotMarket,
        this.owner,
        side,
        price,
        quantity,
        orderType
      );
    }
  }

  public async cancelAllOrders(): Promise<void> {
    const orders = await (await this.getAllBidsAndAsks(true)).flat();
    // todo: this would fetch a market for every call, cache markets
    const orderInfo = Promise.all(
      orders.map((orderInfo) => this.cancelOrder(orderInfo))
    );
  }

  public async cancelOrderByOrderId(orderId: string): Promise<void> {
    const orders = await (await this.getAllBidsAndAsks(true)).flat();
    const orderInfo = orders.filter(
      (orderInfo) => orderInfo.order.orderId.toNumber().toString() === orderId
    )[0];

    await this.cancelOrder(orderInfo);
  }

  public async cancelOrderByClientId(clientId: string): Promise<void> {
    const orders = await (await this.getAllBidsAndAsks(true)).flat();
    const orderInfo = orders.filter(
      (orderInfo) => orderInfo.order.clientId.toNumber().toString() === clientId
    )[0];

    await this.cancelOrder(orderInfo);
  }

  ///

  parseSpotOrders(
    market: Market,
    config: MarketConfig,
    accountInfos: { [key: string]: AccountInfo<Buffer> },
    mangoAccount?: MangoAccount
  ): OrderInfo[] {
    const openOrders = mangoAccount.spotOpenOrdersAccounts[config.marketIndex];
    if (!openOrders) return [];

    const bidData = accountInfos[market["_decoded"].bids.toBase58()]?.data;
    const askData = accountInfos[market["_decoded"].asks.toBase58()]?.data;

    const bidOrderBook =
      market && bidData ? Orderbook.decode(market, bidData) : ([] as Order[]);
    const askOrderBook =
      market && askData ? Orderbook.decode(market, askData) : ([] as Order[]);

    let openOrdersForMarket = [...bidOrderBook, ...askOrderBook];
    if (mangoAccount !== undefined) {
      openOrdersForMarket = openOrdersForMarket.filter((o) =>
        o.openOrdersAddress.equals(openOrders.address)
      );
    }

    return openOrdersForMarket.map<OrderInfo>((order) => ({
      order,
      market: { account: market, config: config },
    }));
  }

  parsePerpOpenOrders(
    market: PerpMarket,
    config: MarketConfig,
    accountInfos: { [key: string]: AccountInfo<Buffer> },
    mangoAccount?: MangoAccount
  ): OrderInfo[] {
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

    let openOrdersForMarket = [...bidOrderBook, ...askOrderBook];
    if (mangoAccount !== undefined) {
      openOrdersForMarket = openOrdersForMarket.filter((o) =>
        o.owner.equals(mangoAccount.publicKey)
      );
    }

    return openOrdersForMarket.map<OrderInfo>((order) => ({
      order,
      market: { account: market, config: config },
    }));
  }

  async cancelOrder(orderInfo: OrderInfo) {
    if (orderInfo.market.config.kind === "perp") {
      const perpMarketConfig = getMarketByBaseSymbolAndKind(
        this.mangoGroupConfig,
        orderInfo.market.config.baseSymbol,
        "perp"
      );
      const perpMarket = await this.mangoGroup.loadPerpMarket(
        this.connection,
        perpMarketConfig.marketIndex,
        perpMarketConfig.baseDecimals,
        perpMarketConfig.quoteDecimals
      );
      await this.client.cancelPerpOrder(
        this.mangoGroup,
        this.mangoAccount,
        this.owner,
        perpMarket,
        orderInfo.order as PerpOrder
      );
    } else {
      const spotMarketConfig = getMarketByBaseSymbolAndKind(
        this.mangoGroupConfig,
        orderInfo.market.config.baseSymbol,
        "spot"
      );
      const spotMarket = await Market.load(
        this.connection,
        spotMarketConfig.publicKey,
        undefined,
        this.mangoGroupConfig.serumProgramId
      );
      await this.client.cancelSpotOrder(
        this.mangoGroup,
        this.mangoAccount,
        this.owner,
        spotMarket,
        orderInfo.order as Order
      );
    }
  }
}

export default MangoSimpleClient;
