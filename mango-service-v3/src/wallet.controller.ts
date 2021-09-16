import { Balances } from "./types";
import { i80f48ToPercent } from "./utils";
import {
  I80F48,
  getTokenBySymbol,
  nativeI80F48ToUi,
  nativeToUi,
  QUOTE_INDEX,
} from "@blockworks-foundation/mango-client";
import { Market, OpenOrders } from "@project-serum/serum";
import Controller from "controller.interface";
import { NextFunction, Request, Response, Router } from "express";
import { sumBy } from "lodash";
import MangoSimpleClient from "mango.simple.client";

class WalletController implements Controller {
  public path = "/api/wallet";
  public router = Router();

  constructor(public mangoSimpleClient: MangoSimpleClient) {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get(`${this.path}/balances`, this.getBalances);
  }

  private getBalances = async (
    request: Request,
    response: Response,
    next: NextFunction
  ) => {
    // local copies of mango objects
    const mangoGroupConfig = this.mangoSimpleClient.mangoGroupConfig;
    const mangoGroup = this.mangoSimpleClient.mangoGroup;

    // (re)load things which we want fresh
    const [mangoAccount, mangoCache, rootBanks] = await Promise.all([
      this.mangoSimpleClient.mangoAccount.reload(
        this.mangoSimpleClient.connection,
        this.mangoSimpleClient.mangoGroup.dexProgramId
      ),
      this.mangoSimpleClient.mangoGroup.loadCache(
        this.mangoSimpleClient.connection
      ),
      mangoGroup.loadRootBanks(this.mangoSimpleClient.connection),
    ]);

    ////// copy pasta block from mango-ui-v3
    /* tslint:disable */
    const balances: Balances[][] = new Array();

    for (const {
      marketIndex,
      baseSymbol,
      name,
    } of mangoGroupConfig.spotMarkets) {
      if (!mangoAccount || !mangoGroup) {
        response.send([]);
      }

      const openOrders: OpenOrders =
        mangoAccount.spotOpenOrdersAccounts[marketIndex];
      const quoteCurrencyIndex = QUOTE_INDEX;

      let nativeBaseFree = 0;
      let nativeQuoteFree = 0;
      let nativeBaseLocked = 0;
      let nativeQuoteLocked = 0;
      if (openOrders) {
        nativeBaseFree = openOrders.baseTokenFree.toNumber();
        nativeQuoteFree = openOrders.quoteTokenFree
          .add((openOrders as any)["referrerRebatesAccrued"])
          .toNumber();
        nativeBaseLocked = openOrders.baseTokenTotal
          .sub(openOrders.baseTokenFree)
          .toNumber();
        nativeQuoteLocked = openOrders.quoteTokenTotal
          .sub(openOrders.quoteTokenFree)
          .toNumber();
      }

      const tokenIndex = marketIndex;

      const net = (nativeBaseLocked: number, tokenIndex: number) => {
        const amount = mangoAccount
          .getUiDeposit(
            mangoCache.rootBankCache[tokenIndex],
            mangoGroup,
            tokenIndex
          )
          .add(
            nativeI80F48ToUi(
              I80F48.fromNumber(nativeBaseLocked),
              mangoGroup.tokens[tokenIndex].decimals
            ).sub(
              mangoAccount.getUiBorrow(
                mangoCache.rootBankCache[tokenIndex],
                mangoGroup,
                tokenIndex
              )
            )
          );

        return amount;
      };

      const value = (nativeBaseLocked: number, tokenIndex: number) => {
        const amount = mangoGroup
          .getPrice(tokenIndex, mangoCache)
          .mul(net(nativeBaseLocked, tokenIndex));

        return amount;
      };

      const marketPair = [
        {
          market: null as null,
          key: `${name}`,
          symbol: baseSymbol,
          deposits: mangoAccount.getUiDeposit(
            mangoCache.rootBankCache[tokenIndex],
            mangoGroup,
            tokenIndex
          ),
          borrows: mangoAccount.getUiBorrow(
            mangoCache.rootBankCache[tokenIndex],
            mangoGroup,
            tokenIndex
          ),
          orders: nativeToUi(
            nativeBaseLocked,
            mangoGroup.tokens[tokenIndex].decimals
          ),
          unsettled: nativeToUi(
            nativeBaseFree,
            mangoGroup.tokens[tokenIndex].decimals
          ),
          net: net(nativeBaseLocked, tokenIndex),
          value: value(nativeBaseLocked, tokenIndex),
          depositRate: i80f48ToPercent(mangoGroup.getDepositRate(tokenIndex)),
          borrowRate: i80f48ToPercent(mangoGroup.getBorrowRate(tokenIndex)),
        },
        {
          market: null as null,
          key: `${name}`,
          symbol: mangoGroupConfig.quoteSymbol,
          deposits: mangoAccount.getUiDeposit(
            mangoCache.rootBankCache[quoteCurrencyIndex],
            mangoGroup,
            quoteCurrencyIndex
          ),
          borrows: mangoAccount.getUiBorrow(
            mangoCache.rootBankCache[quoteCurrencyIndex],
            mangoGroup,
            quoteCurrencyIndex
          ),
          orders: nativeToUi(
            nativeQuoteLocked,
            mangoGroup.tokens[quoteCurrencyIndex].decimals
          ),
          unsettled: nativeToUi(
            nativeQuoteFree,
            mangoGroup.tokens[quoteCurrencyIndex].decimals
          ),
          net: net(nativeQuoteLocked, quoteCurrencyIndex),
          value: value(nativeQuoteLocked, quoteCurrencyIndex),
          depositRate: i80f48ToPercent(mangoGroup.getDepositRate(tokenIndex)),
          borrowRate: i80f48ToPercent(mangoGroup.getBorrowRate(tokenIndex)),
        },
      ];
      balances.push(marketPair);
    }

    const baseBalances = balances.map((b) => b[0]);
    const quoteBalances = balances.map((b) => b[1]);
    const quoteMeta = quoteBalances[0];
    const quoteInOrders = sumBy(quoteBalances, "orders");
    const unsettled = sumBy(quoteBalances, "unsettled");

    const net: I80F48 = quoteMeta.deposits
      .add(I80F48.fromNumber(unsettled))
      .sub(quoteMeta.borrows)
      .add(I80F48.fromNumber(quoteInOrders));
    const token = getTokenBySymbol(mangoGroupConfig, quoteMeta.symbol);
    const tokenIndex = mangoGroup.getTokenIndex(token.mintKey);
    const value = net.mul(mangoGroup.getPrice(tokenIndex, mangoCache));
    /* tslint:enable */
    ////// end of copy pasta block from mango-ui-v3

    // append balances for base symbols
    const balanceDtos = baseBalances.map((baseBalance) => {
      return {
        coin: baseBalance.key,
        free: baseBalance.deposits.toNumber(),
        spotBorrow: baseBalance.borrows.toNumber(),
        total: baseBalance.net.toNumber(),
        usdValue: baseBalance.value.toNumber(),
        availableWithoutBorrow: baseBalance.net
          .sub(baseBalance.borrows)
          .toNumber(),
      } as BalanceDto;
    });

    // append balance for quote symbol
    balanceDtos.push({
      coin: this.mangoSimpleClient.mangoGroupConfig.quoteSymbol,
      free: quoteMeta.deposits.toNumber(),
      spotBorrow: quoteMeta.borrows.toNumber(),
      total: net.toNumber(),
      usdValue: value.toNumber(),
      availableWithoutBorrow: net.sub(quoteMeta.borrows).toNumber(),
    });

    response.send({ success: true, result: balanceDtos } as BalancesDto);
  };
}

export default WalletController;

/// Dtos

// e.g.
// {
//   "success": true,
//   "result": [
//     {
//       "coin": "USDTBEAR",
//       "free": 2320.2,
//       "spotBorrow": 0.0,
//       "total": 2340.2,
//       "usdValue": 2340.2,
//       "availableWithoutBorrow": 2320.2
//     }
//   ]
// }

interface BalancesDto {
  success: boolean;
  result: BalanceDto[];
}

interface BalanceDto {
  coin: string;
  free: number;
  spotBorrow: number;
  total: number;
  usdValue: number;
  availableWithoutBorrow: number;
}
