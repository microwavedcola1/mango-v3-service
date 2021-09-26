import datetime
import logging
import os
import sys
import time
from dataclasses import dataclass
from decimal import Decimal
from os.path import getmtime

from tenacity import retry, wait_fixed, stop_after_delay, stop_after_attempt

from mango_service_v3_py.api import MangoServiceV3Client
from mango_service_v3_py.dtos import Side, PlaceOrder

# based on https://github.com/BitMEX/sample-market-maker/blob/master/market_maker/market_maker.py

CYCLE_INTERVAL = 30
MARKET = "BTC-PERP"
SIZE = 0.0003
MAX_LONG_POSITION = 0.002
MAX_SHORT_POSITION = -0.002
MAX_ORDERS = 4

watched_files_mtimes = [(f, getmtime(f)) for f in ["example3_market_maker.py"]]

logging.basicConfig(
    format="%(asctime)s %(levelname)-2s %(message)s",
    level=logging.INFO,
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("simple_market_maker")


@dataclass
class SimpleOrder:
    price: float
    side: Side
    size: float


def toNearest(num, tickDec):
    return Decimal(round(num / tickDec, 0)) * tickDec


class MM:
    def __init__(self):
        self.mango_service_v3_client = MangoServiceV3Client()
        self.market = None
        self.start_position_buy = None
        self.start_position_sell = None
        self.positions = None

    # todo unused
    @retry(stop=(stop_after_delay(10) | stop_after_attempt(5)), wait=wait_fixed(5))
    def retry_wrapper(self, mango_service_v3_client_method, *arg):
        getattr(self.mango_service_v3_client, mango_service_v3_client_method)(arg)

    def log_recent_trades(self) -> None:
        trades = self.mango_service_v3_client.get_trades(MARKET)
        recent_trades = [
            trade
            for trade in trades
            if datetime.datetime.now((datetime.timezone.utc)) - trade.time
            < datetime.timedelta(seconds=CYCLE_INTERVAL)
        ]
        if recent_trades:
            # todo: should log only my recent trades
            logger.info("- recent trades")
            for trade in recent_trades:
                logger.info(
                    f" |_ side {trade.side:4}, size {trade.size:6}, price {trade.price:8}, value {trade.price * trade.size}, time: {trade.time.strftime('%H:%M:%S')}"
                )
            logger.info("")

    def get_ticker(self):
        self.market = self.mango_service_v3_client.get_market_by_market_name(MARKET)[0]
        self.start_position_buy = self.market.bid - self.market.price_increment
        self.start_position_sell = self.market.ask + self.market.price_increment

        self.positions = [
            position
            for position in self.mango_service_v3_client.get_open_positions()
            if position.future == MARKET
        ]

    def get_price_offset(self, index):
        start_position = (
            self.start_position_buy if index < 0 else self.start_position_sell
        )
        index = index + 1 if index < 0 else index - 1
        return toNearest(
            Decimal(start_position) * Decimal(1 + self.market.price_increment) ** index,
            Decimal(str(self.market.price_increment)),
        )

    def prepare_order(self, index) -> SimpleOrder:
        size = Decimal(str(SIZE)) + ((abs(index) - 1) * Decimal(str(SIZE)))
        price = self.get_price_offset(index)
        return SimpleOrder(price=price, size=size, side="buy" if index < 0 else "sell")

    def converge_orders(self, buy_orders, sell_orders):
        to_create = []
        to_cancel = []
        buys_matched = 0
        sells_matched = 0
        existing_orders = self.mango_service_v3_client.get_orders()

        existing_orders = sorted(existing_orders, key=lambda order_: order_.price)
        buy_orders = sorted(buy_orders, key=lambda order_: order_.price)
        sell_orders = sorted(sell_orders, key=lambda order_: order_.price)

        for order in existing_orders:
            try:
                if order.side == "buy":
                    desired_order = buy_orders[buys_matched]
                    buys_matched += 1
                else:
                    desired_order = sell_orders[sells_matched]
                    sells_matched += 1

                if desired_order.size != Decimal(str(order.size)) or (
                    desired_order.price != Decimal(str(order.price))
                    and abs((desired_order.price / Decimal(str(order.price))) - 1)
                    > 0.01
                ):
                    to_cancel.append(order)
                    to_create.append(desired_order)

            except IndexError:
                to_cancel.append(order)

        while buys_matched < len(buy_orders):
            to_create.append(buy_orders[buys_matched])
            buys_matched += 1

        while sells_matched < len(sell_orders):
            to_create.append(sell_orders[sells_matched])
            sells_matched += 1

        if len(to_cancel) > 0:
            logger.info(f"- cancelling {len(to_cancel)} orders...")
            for order in sorted(to_create, key=lambda order: order.price, reverse=True):
                logger.info(
                    f" |_ side {order.side:4}, size {order.size}, price {order.price}, value {order.price * order.size}"
                )
            for order in to_cancel:
                try:
                    self.mango_service_v3_client.cancel_order_by_order_id(order.id)
                except:
                    pass
            logger.info("")
        else:
            logger.info("- no orders to cancel")

        if len(to_create) > 0:
            logger.info(f"- creating {len(to_create)} orders...")
            for order in [
                order
                for order in sorted(
                    to_create, key=lambda order: order.price, reverse=True
                )
                if order.side == "sell"
            ]:
                logger.info(
                    f" |_ price {order.price}, side {order.side:4}, size {order.size}, value {order.price * order.size}"
                )
            logger.info(
                f"    current bid -> {self.market.bid}, ask {self.market.ask} <- ask "
            )
            for order in [
                order
                for order in sorted(
                    to_create, key=lambda order: order.price, reverse=True
                )
                if order.side == "buy"
            ]:
                logger.info(
                    f" |_ price {order.price}, side {order.side:4}, size {order.size}, value {order.price * order.size}"
                )
            for order in to_create:
                self.mango_service_v3_client.place_order(
                    PlaceOrder(
                        market=MARKET,
                        side=order.side,
                        price=order.price,
                        type="limit",
                        size=order.size,
                        reduce_only=False,
                        ioc=False,
                        post_only=False,
                        client_id=123,
                    )
                )
            logger.info("")
        else:
            logger.info("- no orders to create, current open orders")
            for order in sorted(
                existing_orders, key=lambda order: order.price, reverse=True
            ):
                logger.info(
                    f" |_ side {order.side:4}, size {order.size}, price {order.price}, value {order.price * order.size}"
                )

    def long_position_limit_exceeded(self):
        if len(self.positions) == 0:
            return False
        return self.positions[0].net_size >= MAX_LONG_POSITION

    def short_position_limit_exceeded(self):
        if len(self.positions) == 0:
            return False
        return self.positions[0].net_size <= MAX_SHORT_POSITION

    def place_orders(self):
        buy_orders = []
        sell_orders = []
        if not self.long_position_limit_exceeded():
            for i in reversed(range(1, 2 + 1)):
                buy_orders.append(self.prepare_order(-i))
        else:
            logger.info(
                f"- skipping adding to longs, current position {self.positions[0].net_size}"
            )
        if not self.short_position_limit_exceeded():
            for i in reversed(range(1, MAX_ORDERS + 1)):
                sell_orders.append(self.prepare_order(i))
        else:
            logger.info(
                f"- skipping adding to shorts, current position {self.positions[0].net_size}"
            )

        return self.converge_orders(buy_orders, sell_orders)

    def check_file_change(self):
        for f, mtime in watched_files_mtimes:
            if getmtime(f) > mtime:
                self.restart()

    def restart(self):
        logger.info("------------------------------")
        logger.info("restarting the market maker...")
        os.execv(sys.executable, [sys.executable] + sys.argv)


if __name__ == "__main__":

    mm = MM()
    logger.info("cancelling all orders...")

    try:
        mm.mango_service_v3_client.cancel_all_orders()
    except Exception as e:
        logger.error(f"Exception: {e}")

    while True:
        logger.info("next cycle...")
        try:
            mm.check_file_change()
            mm.log_recent_trades()
            mm.get_ticker()
            mm.place_orders()
            time.sleep(CYCLE_INTERVAL)
            logger.info("")
        except Exception as e:
            logger.error(f"Exception: {e}")
            time.sleep(CYCLE_INTERVAL)
            logger.info("")
