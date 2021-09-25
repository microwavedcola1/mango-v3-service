import json
import os
import time
from decimal import Decimal
from threading import Timer
from typing import List

import httpx
from pydantic import parse_obj_as

from mango_service_v3_py.dtos import (
    Position,
    Balance,
    Market,
    Orderbook,
    Trade,
    Candle,
    Order,
    PlaceOrder,
)


# todo add mypy


def delayed(seconds):
    def decorator(f):
        def wrapper(*args, **kargs):
            time.sleep(seconds)
            return f(*args, **kargs)

        return wrapper

    return decorator


class MangoServiceV3Client:
    def __init__(self):
        if "BASE_URL" in os.environ:
            self.BASE_URL = f"{os.environ['BASE_URL']}/api"
        else:
            self.BASE_URL = "http://localhost:3000/api"

    @delayed(2)
    def get_open_positions(self) -> List[Position]:
        response = httpx.get(f"{self.BASE_URL}/positions", timeout=10.0)
        return parse_obj_as(List[Position], json.loads(response.text)["result"])

    @delayed(2)
    def get_balances(self) -> List[Balance]:
        response = httpx.get(f"{self.BASE_URL}/wallet/balances", timeout=10.0)
        return parse_obj_as(List[Balance], json.loads(response.text)["result"])

    @delayed(2)
    def get_markets(self) -> List[Market]:
        response = httpx.get(f"{self.BASE_URL}/markets", timeout=10.0)
        return parse_obj_as(List[Market], json.loads(response.text)["result"])

    @delayed(2)
    def get_market_by_market_name(self, market_name: str) -> List[Market]:
        response = httpx.get(f"{self.BASE_URL}/markets/{market_name}", timeout=10.0)
        return parse_obj_as(List[Market], json.loads(response.text)["result"])

    @delayed(2)
    def get_orderboook(self, market_name: str, depth: int = 30) -> Orderbook:
        response = httpx.get(
            f"{self.BASE_URL}/markets/{market_name}/orderbook?depth={depth}"
        )
        return parse_obj_as(Orderbook, json.loads(response.text)["result"])

    @delayed(2)
    def get_trades(self, market_name: str) -> List[Trade]:
        response = httpx.get(
            f"{self.BASE_URL}/markets/{market_name}/trades", timeout=10.0
        )
        return parse_obj_as(List[Trade], json.loads(response.text)["result"])

    @delayed(2)
    def get_candles(
        self, market_name: str, resolution: int, start_time: int, end_time: int
    ) -> List[Candle]:
        response = httpx.get(
            f"{self.BASE_URL}/markets/{market_name}/candles?resolution={resolution}&start_time={start_time}&end_time={end_time}"
        )
        return parse_obj_as(List[Candle], json.loads(response.text)["result"])

    @delayed(2)
    def get_orders(self,) -> List[Order]:
        response = httpx.get(f"{self.BASE_URL}/orders", timeout=10.0)
        return parse_obj_as(List[Order], json.loads(response.text)["result"])

    @delayed(2)
    def get_orders_by_market_name(self, market_name: str) -> List[Order]:
        response = httpx.get(
            f"{self.BASE_URL}/orders?market={market_name}", timeout=10.0
        )
        return parse_obj_as(List[Order], json.loads(response.text)["result"])

    @delayed(2)
    def place_order(self, order: PlaceOrder) -> None:
        response = httpx.post(
            f"{self.BASE_URL}/orders", json=order.dict(by_alias=True), timeout=10.0
        )
        # if response.status_code == httpx.codes.BAD_REQUEST:
        #     return parse_obj_as(
        #         List[BadRequestError], json.loads(response.text)["errors"]
        #     )

    @delayed(2)
    def cancel_order_by_client_id(self, client_id):
        response = httpx.delete(
            f"{self.BASE_URL}/orders/by_client_id/{client_id}", timeout=10.0
        )

    @delayed(2)
    def cancel_order_by_order_id(self, order_id):
        response = httpx.delete(f"{self.BASE_URL}/orders/{order_id}", timeout=10.0)

    @delayed(2)
    def cancel_all_orders(self):
        response = httpx.delete(f"{self.BASE_URL}/orders", timeout=10.0)

    @staticmethod
    def to_nearest(num, tickDec):
        return float(round(num / tickDec, 0)) * tickDec
