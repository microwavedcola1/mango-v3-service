from mango_service_v3_py.api import Exchange
from mango_service_v3_py.dtos import PlacePerpOrder, PlaceOrder

if __name__ == "__main__":

    exchange = Exchange()

    print(exchange.get_open_positions())

    print(exchange.get_balances())

    print(exchange.get_markets())
    print(exchange.get_market_by_market_name("BTC-PERP"))

    print(exchange.get_orderboook("BTC-PERP"))

    print(exchange.get_trades("BTC-PERP"))

    print(exchange.get_candles("BTC-PERP", 60, 1625922900, 1631214960))

    print(exchange.get_orders())
    print(exchange.get_orders_by_market_name("BTC-PERP"))

    exchange.place_order(
        PlacePerpOrder(
            market="BTC-PERP",
            side="buy",
            price=2000,
            type="limit",
            size=0.0001,
            reduce_only=False,
            ioc=False,
            post_only=False,
            client_id=123,
        )
    )
    print(exchange.get_orders())

    exchange.place_order(
        PlaceOrder(
            market="BTC/USDC",
            side="buy",
            price=2000,
            type="limit",
            size=0.0001,
            reduce_only=False,
            ioc=False,
            post_only=False,
        )
    )
    print(exchange.get_orders())

    exchange.cancel_order_by_order_id("3689367261485984031001846")
    print(exchange.get_orders())

    exchange.cancel_order_by_client_id("3689367261485984031001846")
    print(exchange.get_orders())

    exchange.cancel_all_orders()
    print(exchange.get_orders())
