from mango_service_v3_py.api import Exchange
from mango_service_v3_py.dtos import PlacePerpOrder

MARKET = "BTC-PERP"


def fibonacci_of(n):
    if n in {0, 1}:
        return n
    return fibonacci_of(n - 1) + fibonacci_of(n - 2)


if __name__ == "__main__":
    exchange = Exchange()

    exchange.delete_all_orders()

    balances = exchange.get_balances()
    total_usd_balance = sum([balance.usd_value for balance in balances])

    market = exchange.get_market_by_market_name(MARKET)[0]

    lowest = 25
    fibs = [fib for fib in [fibonacci_of(n) for n in range(10)] if fib < lowest][1:]
    fibs_sum = sum(fibs)

    for i, fib in enumerate(fibs):
        print((100 - fibs[-1] + fib) / 100)
        price = market.last * (100 - fibs[-1] + fib) / 100
        size = (total_usd_balance / market.price) * (fibs[len(fibs) - 1 - i] / fibs_sum)
        if size < market.size_increment:
            continue
        print(f"setting order, price: {price}, size: {size}, value: {price * size}")
        exchange.place_order(
            PlacePerpOrder(
                market=MARKET,
                side="buy",
                price=price,
                type="limit",
                size=size,
                reduce_only=False,
                ioc=False,
                post_only=False,
                client_id=123,
            )
        )
    print(exchange.get_orders())
