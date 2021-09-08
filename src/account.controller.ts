import {
  getMarketByPublicKey,
  PerpMarket,
  ZERO_BN,
} from "@blockworks-foundation/mango-client";
import BN from "bn.js";
import Controller from "controller.interface";
import { NextFunction, Request, Response, Router } from "express";
import MangoSimpleClient from "mango.simple.client";

class AccountController implements Controller {
  public path = "/positions";
  public router = Router();

  constructor(public mangoMarkets: MangoSimpleClient) {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get(this.path, this.getPositions);
  }

  private getPositions = async (
    request: Request,
    response: Response,
    next: NextFunction
  ) => {
    const groupConfig = this.mangoMarkets.mangoGroupConfig;
    const mangoGroup = this.mangoMarkets.mangoGroup;
    const mangoAccount = await this.mangoMarkets.mangoAccount.reload(
      this.mangoMarkets.connection,
      this.mangoMarkets.mangoGroup.dexProgramId
    );
    const mangoCache = await this.mangoMarkets.mangoGroup.loadCache(
      this.mangoMarkets.connection
    );

    const allMarkets = await this.mangoMarkets.getAllMarkets();
    const mangoAccountFills = await this.mangoMarkets.getAllFills(true);

    const perpAccounts = mangoAccount
      ? groupConfig.perpMarkets.map((m) => {
          return {
            perpAccount: mangoAccount.perpAccounts[m.marketIndex],
            marketIndex: m.marketIndex,
          };
        })
      : [];
    const filteredPerpAccounts = perpAccounts.filter(
      ({ perpAccount }) => !perpAccount.basePosition.eq(new BN(0))
    );

    const postionDtos = filteredPerpAccounts.map(
      ({ perpAccount, marketIndex }, index) => {
        const perpMarketInfo =
          this.mangoMarkets.mangoGroup.perpMarkets[marketIndex];
        const marketConfig = getMarketByPublicKey(
          groupConfig,
          perpMarketInfo.perpMarket
        );
        const perpMarket = allMarkets[
          perpMarketInfo.perpMarket.toBase58()
        ] as PerpMarket;
        const perpTradeHistory = mangoAccountFills.filter(
          (t) => t.marketName === marketConfig.name
        );

        let breakEvenPrice;
        try {
          breakEvenPrice = perpAccount.getBreakEvenPrice(
            mangoAccount,
            perpMarket,
            perpTradeHistory
          );
        } catch (e) {
          breakEvenPrice = null;
        }

        const pnl =
          breakEvenPrice !== null
            ? perpMarket.baseLotsToNumber(perpAccount.basePosition) *
              (this.mangoMarkets.mangoGroup
                .getPrice(marketIndex, mangoCache)
                .toNumber() -
                parseFloat(breakEvenPrice))
            : null;

        let entryPrice;
        try {
          entryPrice = perpAccount.getAverageOpenPrice(
            mangoAccount,
            perpMarket,
            perpTradeHistory
          );
        } catch {
          entryPrice = 0;
        }

        return {
          cost: Math.abs(
            perpMarket.baseLotsToNumber(perpAccount.basePosition) *
              mangoGroup.getPrice(marketIndex, mangoCache).toNumber()
          ),
          cumulativeBuySize: undefined,
          cumulativeSellSize: undefined,
          entryPrice: entryPrice,
          estimatedLiquidationPrice: undefined,
          future: marketConfig.baseSymbol,
          initialMarginRequirement: undefined,
          longOrderSize: undefined,
          maintenanceMarginRequirement: undefined,
          netSize: undefined,
          openSize: undefined,
          realizedPnl: undefined,
          recentAverageOpenPrice: undefined,
          recentBreakEvenPrice: breakEvenPrice,
          recentPnl: pnl,
          shortOrderSize: undefined,
          side: perpAccount.basePosition.gt(ZERO_BN) ? "long" : "short",
          size: Math.abs(perpMarket.baseLotsToNumber(perpAccount.basePosition)),
          unrealizedPnl: pnl,
          collateralUsed: undefined,
        } as PositionDto;
      }
    );

    response.send({ success: true, result: postionDtos } as PositionsDto);
  };
}

export default AccountController;

/// Dtos

// e.g.
// {
//   "success": true,
//   "result": [
//     {
//       "cost": -31.7906,
//       "cumulativeBuySize": 1.2,
//       "cumulativeSellSize": 0.0,
//       "entryPrice": 138.22,
//       "estimatedLiquidationPrice": 152.1,
//       "future": "ETH-PERP",
//       "initialMarginRequirement": 0.1,
//       "longOrderSize": 1744.55,
//       "maintenanceMarginRequirement": 0.04,
//       "netSize": -0.23,
//       "openSize": 1744.32,
//       "realizedPnl": 3.39441714,
//       "recentAverageOpenPrice": 135.31,
//       "recentBreakEvenPrice": 135.31,
//       "recentPnl": 3.1134,
//       "shortOrderSize": 1732.09,
//       "side": "sell",
//       "size": 0.23,
//       "unrealizedPnl": 0,
//       "collateralUsed": 3.17906
//     }
//   ]
// }

interface PositionsDto {
  success: boolean;
  result: PositionDto[];
}

interface PositionDto {
  cost: number;
  cumulativeBuySize: number;
  cumulativeSellSize: number;
  entryPrice: number;
  estimatedLiquidationPrice: number;
  future: "ETH-PERP";
  initialMarginRequirement: number;
  longOrderSize: number;
  maintenanceMarginRequirement: number;
  netSize: number;
  openSize: number;
  realizedPnl: number;
  recentAverageOpenPrice: number;
  recentBreakEvenPrice: number;
  recentPnl: number;
  shortOrderSize: number;
  side: string;
  size: number;
  unrealizedPnl: number;
  collateralUsed: number;
}
