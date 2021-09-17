import { logger, zipDict } from "./utils";
import {
  BookSide,
  BookSideLayout,
  Config,
  getAllMarkets,
  getMarketByBaseSymbolAndKind,
  getMarketByPublicKey,
  getMultipleAccounts,
  GroupConfig,
  MangoAccount,
  MangoClient,
  MangoGroup,
  MarketConfig,
  PerpMarket,
  PerpMarketLayout,
  PerpOrder,
} from "@blockworks-foundation/mango-client";
import { Market, Orderbook } from "@project-serum/serum";
import { Order } from "@project-serum/serum/lib/market";
import {
  Account,
  AccountInfo,
  Commitment,
  Connection,
  PublicKey,
} from "@solana/web3.js";
import fs from "fs";
import fetch from "node-fetch";
import os from "os";
import { OrderInfo } from "types";

class MangoSimpleClient {
  constructor(
    public mangoGroupConfig: GroupConfig,
    public connection: Connection,
    public client: MangoClient,
    public mangoGroup: MangoGroup,
    public owner: Account,
    public mangoAccount: MangoAccount
  ) {
    setInterval(this.roundRobinClusterUrl, 20_000);
  }

  private roundRobinClusterUrl() {
    let clusterUrl =
      process.env.CLUSTER_URL || "https://api.mainnet-beta.solana.com";

    if (clusterUrl.includes("devnet")) {
      return;
    }

    let possibleClustersUrls = [
      "https://api.mainnet-beta.solana.com",
      "https://lokidfxnwlabdq.main.genesysgo.net:8899/",
      "https://solana-api.projectserum.com/",
    ];
    clusterUrl =
      possibleClustersUrls[
        Math.floor(Math.random() * possibleClustersUrls.length)
      ];

    logger.info(`switching to rpc node - ${clusterUrl}...`);
    this.connection = new Connection(clusterUrl, "processed" as Commitment);
  }

  static async create() {
    const groupName = process.env.GROUP || "mainnet.1";
    const clusterUrl =
      process.env.CLUSTER_URL || "https://api.mainnet-beta.solana.com";

    logger.info(`Creating mango client for ${groupName} using ${clusterUrl}`);

    const mangoGroupConfig: GroupConfig = Config.ids().groups.filter(
      (group) => group.name === groupName
    )[0];

    const connection = new Connection(clusterUrl, "processed" as Commitment);

    const mangoClient = new MangoClient(
      connection,
      mangoGroupConfig.mangoProgramId
    );

    logger.info(`- fetching mango group`);
    const mangoGroup = await mangoClient.getMangoGroup(
      mangoGroupConfig.publicKey
    );

    logger.info(`- loading root banks`);
    await mangoGroup.loadRootBanks(connection);

    logger.info(`- loading cache`);
    await mangoGroup.loadCache(connection);

    const owner = new Account(
      JSON.parse(
        process.env.KEYPAIR ||
          fs.readFileSync(os.homedir() + "/.config/solana/id.json", "utf-8")
      )
    );

    logger.info(`- fetching mango accounts for ${owner.publicKey.toBase58()}`);
    let mangoAccounts;
    try {
      mangoAccounts = await mangoClient.getMangoAccountsForOwner(
        mangoGroup,
        owner.publicKey
      );
    } catch (error) {
      logger.error(
        `- error retrieving mango accounts for ${owner.publicKey.toBase58()}`
      );
      process.exit(1);
    }

    if (!mangoAccounts.length) {
      logger.error(`- no mango account found ${owner.publicKey.toBase58()}`);
      process.exit(1);
    }

    const sortedMangoAccounts = mangoAccounts
      .slice()
      .sort((a, b) =>
        a.publicKey.toBase58() > b.publicKey.toBase58() ? 1 : -1
      );

    let chosenMangoAccount;
    if (process.env.MANGO_ACCOUNT) {
      const filteredMangoAccounts = sortedMangoAccounts.filter(
        (mangoAccount) =>
          mangoAccount.publicKey.toBase58() === process.env.MANGO_ACCOUNT
      );
      if (!filteredMangoAccounts.length) {
        logger.error(
          `- no mango account found for key ${process.env.MANGO_ACCOUNT}`
        );
        process.exit(1);
      }
      chosenMangoAccount = filteredMangoAccounts[0];
    } else {
      chosenMangoAccount = sortedMangoAccounts[0];
    }

    const debugAccounts = sortedMangoAccounts
      .map((mangoAccount) => mangoAccount.publicKey.toBase58())
      .join(", ");
    logger.info(
      `- found mango accounts ${debugAccounts}, using ${chosenMangoAccount.publicKey.toBase58()}`
    );

    return new MangoSimpleClient(
      mangoGroupConfig,
      connection,
      mangoClient,
      mangoGroup,
      owner,
      chosenMangoAccount
    );
  }

  /// public

  public async fetchAllMarkets(
    marketName?: string
  ): Promise<Partial<Record<string, Market | PerpMarket>>> {
    let allMarketConfigs = getAllMarkets(this.mangoGroupConfig);
    let allMarketPks = allMarketConfigs.map((m) => m.publicKey);

    if (marketName !== undefined) {
      allMarketConfigs = allMarketConfigs.filter(
        (marketConfig) => marketConfig.name === marketName
      );
      allMarketPks = allMarketConfigs.map((m) => m.publicKey);
    }

    const allMarketAccountInfos = await getMultipleAccounts(
      this.connection,
      allMarketPks
    );

    const allMarketAccounts = allMarketConfigs.map((config, i) => {
      if (config.kind === "spot") {
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
      if (config.kind === "perp") {
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

  public async fetchAllBidsAndAsks(
    filterForMangoAccount: boolean = false,
    marketName?: string
  ): Promise<OrderInfo[][]> {
    this.mangoAccount.loadOpenOrders(
      this.connection,
      new PublicKey(this.mangoGroupConfig.serumProgramId)
    );

    let allMarketConfigs = getAllMarkets(this.mangoGroupConfig);
    let allMarketPks = allMarketConfigs.map((m) => m.publicKey);

    if (marketName !== undefined) {
      allMarketConfigs = allMarketConfigs.filter(
        (marketConfig) => marketConfig.name === marketName
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

    const markets = await this.fetchAllMarkets(marketName);

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

  public async fetchAllSpotFills(): Promise<any[]> {
    const allMarketConfigs = getAllMarkets(this.mangoGroupConfig);
    const allMarkets = await this.fetchAllMarkets();

    // merge
    // 1. latest fills from on-chain
    let allRecentMangoAccountSpotFills: any[] = [];
    // 2. historic from off-chain REST service
    let allButRecentMangoAccountSpotFills: any[] = [];

    for (const config of allMarketConfigs) {
      if (config.kind === "spot") {
        const openOrdersAccount =
          this.mangoAccount.spotOpenOrdersAccounts[config.marketIndex];
        if (openOrdersAccount === undefined) {
          continue;
        }
        const response = await fetch(
          `https://event-history-api.herokuapp.com/trades/open_orders/${openOrdersAccount.publicKey.toBase58()}`
        );
        const responseJson = await response.json();
        allButRecentMangoAccountSpotFills =
          allButRecentMangoAccountSpotFills.concat(
            responseJson?.data ? responseJson.data : []
          );

        const recentMangoAccountSpotFills: any[] = await allMarkets[
          config.publicKey.toBase58()
        ]
          .loadFills(this.connection, 10000)
          .then((fills) => {
            fills = fills.filter((fill) => {
              return openOrdersAccount?.publicKey
                ? fill.openOrders.equals(openOrdersAccount?.publicKey)
                : false;
            });
            return fills.map((fill) => ({ ...fill, marketName: config.name }));
          });
        allRecentMangoAccountSpotFills = allRecentMangoAccountSpotFills.concat(
          recentMangoAccountSpotFills
        );
      }
    }

    const newMangoAccountSpotFills = allRecentMangoAccountSpotFills.filter(
      (fill: any) =>
        !allButRecentMangoAccountSpotFills.flat().find((t: any) => {
          if (t.orderId) {
            return t.orderId === fill.orderId?.toString();
          } else {
            return t.seqNum === fill.seqNum?.toString();
          }
        })
    );

    return [...newMangoAccountSpotFills, ...allButRecentMangoAccountSpotFills];
  }

  public async fetchAllPerpFills(): Promise<any[]> {
    const allMarketConfigs = getAllMarkets(this.mangoGroupConfig);
    const allMarkets = await this.fetchAllMarkets();

    // merge
    // 1. latest fills from on-chain
    let allRecentMangoAccountPerpFills: any[] = [];
    // 2. historic from off-chain REST service
    const response = await fetch(
      `https://event-history-api.herokuapp.com/perp_trades/${this.mangoAccount.publicKey.toBase58()}`
    );
    const responseJson = await response.json();
    const allButRecentMangoAccountPerpFills = responseJson?.data || [];
    for (const config of allMarketConfigs) {
      if (config.kind === "perp") {
        const recentMangoAccountPerpFills: any[] = await allMarkets[
          config.publicKey.toBase58()
        ]
          .loadFills(this.connection)
          .then((fills) => {
            fills = fills.filter(
              (fill) =>
                fill.taker.equals(this.mangoAccount.publicKey) ||
                fill.maker.equals(this.mangoAccount.publicKey)
            );

            return fills.map((fill) => ({ ...fill, marketName: config.name }));
          });

        allRecentMangoAccountPerpFills = allRecentMangoAccountPerpFills.concat(
          recentMangoAccountPerpFills
        );
      }
    }
    const newMangoAccountPerpFills = allRecentMangoAccountPerpFills.filter(
      (fill: any) =>
        !allButRecentMangoAccountPerpFills.flat().find((t: any) => {
          if (t.orderId) {
            return t.orderId === fill.orderId?.toString();
          } else {
            return t.seqNum === fill.seqNum?.toString();
          }
        })
    );

    return [...newMangoAccountPerpFills, ...allButRecentMangoAccountPerpFills];
  }

  public async placeOrder(
    market: string,
    type: "market" | "limit",
    side: "buy" | "sell",
    quantity: number,
    price?: number,
    orderType: "ioc" | "postOnly" | "limit" = "limit",
    clientOrderId?: number
  ): Promise<void> {
    if (type === "market") {
      // todo
      throw new Error("Not implemented!");
    }

    if (market.includes("PERP")) {
      const perpMarketConfig = getMarketByBaseSymbolAndKind(
        this.mangoGroupConfig,
        market.split("-")[0],
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
        orderType,
        clientOrderId
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
    const allMarkets = await this.fetchAllMarkets();
    const orders = (await this.fetchAllBidsAndAsks(true)).flat();
    // todo combine multiple cancels into one transaction
    await Promise.all(
      orders.map((orderInfo) =>
        this.cancelOrder(
          orderInfo,
          allMarkets[orderInfo.market.account.publicKey.toBase58()]
        )
      )
    );
  }

  public async getOrderByOrderId(orderId: string): Promise<OrderInfo[]> {
    const orders = (await this.fetchAllBidsAndAsks(true)).flat();
    const orderInfos = orders.filter(
      (orderInfo) => orderInfo.order.orderId.toString() === orderId
    );
    return orderInfos;
  }

  public async getOrderByClientId(clientId: string): Promise<OrderInfo[]> {
    const orders = await (await this.fetchAllBidsAndAsks(true)).flat();
    const orderInfos = orders.filter(
      (orderInfo) => orderInfo.order.clientId.toNumber().toString() === clientId
    );
    return orderInfos;
  }

  /// private

  private parseSpotOrders(
    market: Market,
    config: MarketConfig,
    accountInfos: { [key: string]: AccountInfo<Buffer> },
    mangoAccount?: MangoAccount
  ): OrderInfo[] {
    const bidData = accountInfos[market["_decoded"].bids.toBase58()]?.data;
    const askData = accountInfos[market["_decoded"].asks.toBase58()]?.data;

    const bidOrderBook =
      market && bidData ? Orderbook.decode(market, bidData) : ([] as Order[]);
    const askOrderBook =
      market && askData ? Orderbook.decode(market, askData) : ([] as Order[]);

    let openOrdersForMarket = [...bidOrderBook, ...askOrderBook];
    if (mangoAccount !== undefined) {
      const openOrders =
        mangoAccount.spotOpenOrdersAccounts[config.marketIndex];
      if (!openOrders) return [];
      openOrdersForMarket = openOrdersForMarket.filter((o) =>
        o.openOrdersAddress.equals(openOrders.address)
      );
    }

    return openOrdersForMarket.map<OrderInfo>((order) => ({
      order,
      market: { account: market, config },
    }));
  }

  private parsePerpOpenOrders(
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
      market: { account: market, config },
    }));
  }

  public async cancelOrder(orderInfo: OrderInfo, market?: Market | PerpMarket) {
    if (orderInfo.market.config.kind === "perp") {
      const perpMarketConfig = getMarketByBaseSymbolAndKind(
        this.mangoGroupConfig,
        orderInfo.market.config.baseSymbol,
        "perp"
      );
      if (market === undefined) {
        market = await this.mangoGroup.loadPerpMarket(
          this.connection,
          perpMarketConfig.marketIndex,
          perpMarketConfig.baseDecimals,
          perpMarketConfig.quoteDecimals
        );
      }
      await this.client.cancelPerpOrder(
        this.mangoGroup,
        this.mangoAccount,
        this.owner,
        market as PerpMarket,
        orderInfo.order as PerpOrder
      );
    } else {
      const spotMarketConfig = getMarketByBaseSymbolAndKind(
        this.mangoGroupConfig,
        orderInfo.market.config.baseSymbol,
        "spot"
      );
      if (market === undefined) {
        market = await Market.load(
          this.connection,
          spotMarketConfig.publicKey,
          undefined,
          this.mangoGroupConfig.serumProgramId
        );
      }
      await this.client.cancelSpotOrder(
        this.mangoGroup,
        this.mangoAccount,
        this.owner,
        market as Market,
        orderInfo.order as Order
      );
    }
  }
}

export default MangoSimpleClient;
