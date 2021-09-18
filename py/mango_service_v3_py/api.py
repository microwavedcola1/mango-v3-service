import inspect
import json
import os
from typing import List

import httpx
from httpx import TimeoutException
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
def timeout_error_msg_customizer(response):
    try:
        response.raise_for_status()
    except TimeoutException as e:
        raise Exception(f"timed out within {inspect.stack()[1][3]}") from e


class Exchange:
    def __init__(self):
        if "BASE_URL" in os.environ:
            self.BASE_URL = f"{os.environ['BASE_URL']}/api"
        else:
            self.BASE_URL = "http://localhost:3000/api"

    def get_open_positions(self) -> List[Position]:
        response = httpx.get(f"{self.BASE_URL}/positions")
        timeout_error_msg_customizer(response)
        return parse_obj_as(List[Position], json.loads(response.text)["result"])

    def get_balances(self) -> List[Balance]:
        response = httpx.get(f"{self.BASE_URL}/wallet/balances")
        timeout_error_msg_customizer(response)
        return parse_obj_as(List[Balance], json.loads(response.text)["result"])

    def get_markets(self) -> List[Market]:
        response = httpx.get(f"{self.BASE_URL}/markets")
        timeout_error_msg_customizer(response)
        return parse_obj_as(List[Market], json.loads(response.text)["result"])

    def get_market_by_market_name(self, market_name: str) -> List[Market]:
        response = httpx.get(f"{self.BASE_URL}/markets/{market_name}")
        timeout_error_msg_customizer(response)
        return parse_obj_as(List[Market], json.loads(response.text)["result"])

    def get_orderboook(self, market_name: str, depth: int = 30) -> Orderbook:
        response = httpx.get(
            f"{self.BASE_URL}/markets/{market_name}/orderbook?depth={depth}"
        )
        timeout_error_msg_customizer(response)
        return parse_obj_as(Orderbook, json.loads(response.text)["result"])

    def get_trades(self, market_name: str) -> List[Trade]:
        response = httpx.get(f"{self.BASE_URL}/markets/{market_name}/trades")
        timeout_error_msg_customizer(response)
        return parse_obj_as(List[Trade], json.loads(response.text)["result"])

    def get_candles(
        self, market_name: str, resolution: int, start_time: int, end_time: int
    ) -> List[Candle]:
        response = httpx.get(
            f"{self.BASE_URL}/markets/{market_name}/candles?resolution={resolution}&start_time={start_time}&end_time={end_time}"
        )
        timeout_error_msg_customizer(response)
        return parse_obj_as(List[Candle], json.loads(response.text)["result"])

    def get_orders(self,) -> List[Order]:
        response = httpx.get(f"{self.BASE_URL}/orders")
        timeout_error_msg_customizer(response)
        return parse_obj_as(List[Order], json.loads(response.text)["result"])

    def get_orders_by_market_name(self, market_name: str) -> List[Order]:
        response = httpx.get(f"{self.BASE_URL}/orders?market={market_name}")
        timeout_error_msg_customizer(response)
        return parse_obj_as(List[Order], json.loads(response.text)["result"])

    def place_order(self, order: PlaceOrder) -> None:
        response = httpx.post(f"{self.BASE_URL}/orders", json=order.dict())
        timeout_error_msg_customizer(response)
        # if response.status_code == httpx.codes.BAD_REQUEST:
        #     return parse_obj_as(
        #         List[BadRequestError], json.loads(response.text)["errors"]
        #     )

    def cancel_order_by_client_id(self, client_id):
        response = httpx.delete(f"{self.BASE_URL}/orders/by_client_id/{client_id}")
        timeout_error_msg_customizer(response)

    def cancel_order_by_order_id(self, order_id):
        response = httpx.delete(f"{self.BASE_URL}/orders/{order_id}")
        timeout_error_msg_customizer(response)

    def cancel_all_orders(self):
        response = httpx.delete(f"{self.BASE_URL}/orders")
        timeout_error_msg_customizer(response)
