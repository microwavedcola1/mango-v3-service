import { Config, GroupConfig } from "@blockworks-foundation/mango-client";
import { I80F48 } from "@blockworks-foundation/mango-client/lib/src/fixednum";
import { CustomValidator } from "express-validator";
/// logging related
import pino from "pino";

/// mango related

export const i80f48ToPercent = (value: I80F48) =>
  value.mul(I80F48.fromNumber(100));

const groupName = process.env.GROUP || "devnet.1";
const mangoGroupConfig: GroupConfig = Config.ids().groups.filter(
  (group) => group.name === groupName
)[0];

const allMarketNames = mangoGroupConfig.spotMarkets
  .map((spotMarketConfig) => spotMarketConfig.name)
  .concat(
    mangoGroupConfig.perpMarkets.map(
      (perpMarketConfig) => perpMarketConfig.name
    )
  );

/// general

export function zipDict<K extends string | number | symbol, V>(
  keys: K[],
  values: V[]
): Partial<Record<K, V>> {
  const result: Partial<Record<K, V>> = {};
  keys.forEach((key, index) => {
    result[key] = values[index];
  });
  return result;
}

export const logger = pino({
  prettyPrint: { translateTime: true },
});

/// expressjs related

export const isValidMarket: CustomValidator = (marketName) => {
  if (allMarketNames.indexOf(marketName) === -1) {
    return Promise.reject(`Market ${marketName} not supported!`);
  }
  return Promise.resolve();
};
