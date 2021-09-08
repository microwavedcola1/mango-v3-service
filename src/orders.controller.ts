import Controller from "./controller.interface";
import MangoSimpleClient from "./mango.simple.client";
import { OrderInfo } from "./types";
import { PerpOrder } from "@blockworks-foundation/mango-client";
import { Order } from "@project-serum/serum/lib/market";
import { NextFunction, Request, Response, Router } from "express";

class OrdersController implements Controller {
  public path = "/orders";
  public router = Router();

  constructor(public mangoSimpleClient: MangoSimpleClient) {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    // GET /orders?market={market_name}
    this.router.get(this.path, this.getOpenOrders);

    // POST /orders
    this.router.post(this.path, this.placeOrder);

    // DELETE /orders
    this.router.delete(this.path, this.cancelAllOrders);
    // DELETE /orders/{order_id}
    this.router.delete(`${this.path}/:order_id`, this.cancelOrderByOrderId);
    // DELETE /orders/by_client_id/{client_order_id}
    this.router.delete(
      `${this.path}/by_client_id/:client_id`,
      this.cancelOrderByClientId
    );
  }

  private getOpenOrders = async (
    request: Request,
    response: Response,
    next: NextFunction
  ) => {
    const openOrders = await this.mangoSimpleClient.getAllBidsAndAsks(
      true,
      request.query.market ? String(request.query.market) : undefined
    );

    const orderDtos = openOrders.flat().map((orderInfo: OrderInfo) => {
      if ("bestInitial" in orderInfo.order) {
        const order_ = orderInfo.order as PerpOrder;
        return {
          createdAt: new Date(order_.timestamp.toNumber()),
          filledSize: undefined,
          future: orderInfo.market.config.name,
          id: order_.orderId.toString(),
          market: orderInfo.market.config.name,
          price: order_.price,
          avgFillPrice: undefined,
          remainingSize: undefined,
          side: order_.side,
          size: order_.size,
          status: "open",
          type: undefined,
          reduceOnly: undefined,
          ioc: undefined,
          postOnly: undefined,
          clientId:
            order_.clientId && order_.clientId.toString() !== "0"
              ? order_.clientId.toString()
              : undefined,
        } as OrderDto;
      }

      const order_ = orderInfo.order as Order;
      return {
        createdAt: undefined,
        filledSize: undefined,
        future: orderInfo.market.config.name,
        id: order_.orderId.toString(),
        market: orderInfo.market.config.name,
        price: order_.price,
        avgFillPrice: undefined,
        remainingSize: undefined,
        side: order_.side,
        size: order_.size,
        status: "open",
        type: undefined,
        reduceOnly: undefined,
        ioc: undefined,
        postOnly: undefined,
        clientId:
          order_.clientId && order_.clientId.toString() !== "0"
            ? order_.clientId.toString()
            : undefined,
      } as OrderDto;
    });
    response.send({ success: true, result: orderDtos } as OrdersDto);
  };

  private placeOrder = async (
    request: Request,
    response: Response,
    next: NextFunction
  ) => {
    const placeOrderDto = <PlaceOrderDto>request.body;
    await this.mangoSimpleClient.placeOrder(
      placeOrderDto.market,
      placeOrderDto.type,
      placeOrderDto.side,
      placeOrderDto.size,
      placeOrderDto.price,
      placeOrderDto.ioc ? "ioc" : placeOrderDto.postOnly ? "postOnly" : "limit"
    );
  };

  private cancelAllOrders = async (
    request: Request,
    response: Response,
    next: NextFunction
  ) => {
    await this.mangoSimpleClient.cancelAllOrders();
  };

  private cancelOrderByOrderId = async (
    request: Request,
    response: Response,
    next: NextFunction
  ) => {
    let order_id = request.params.order_id;
    await this.mangoSimpleClient.cancelOrderByOrderId(order_id);
  };

  private cancelOrderByClientId = async (
    request: Request,
    response: Response,
    next: NextFunction
  ) => {
    let client_id = request.params.client_id;
    await this.mangoSimpleClient.cancelOrderByClientId(client_id);
  };
}

export default OrdersController;

/// Dtos

// e.g.
// {
//   "success": true,
//   "result": [
//     {
//       "createdAt": "2019-03-05T09:56:55.728933+00:00",
//       "filledSize": 10,
//       "future": "XRP-PERP",
//       "id": 9596912,
//       "market": "XRP-PERP",
//       "price": 0.306525,
//       "avgFillPrice": 0.306526,
//       "remainingSize": 31421,
//       "side": "sell",
//       "size": 31431,
//       "status": "open",
//       "type": "limit",
//       "reduceOnly": false,
//       "ioc": false,
//       "postOnly": false,
//       "clientId": null
//     }
//   ]
// }

interface OrdersDto {
  success: boolean;
  result: OrderDto[];
}

interface OrderDto {
  createdAt: Date;
  filledSize: number;
  future: string;
  id: string;
  market: string;
  price: number;
  avgFillPrice: number;
  remainingSize: number;
  side: string;
  size: number;
  status: string;
  type: string;
  reduceOnly: boolean;
  ioc: boolean;
  postOnly: boolean;
  clientId: null;
}

// e.g.
// {
//   "market": "XRP-PERP",
//   "side": "sell",
//   "price": 0.306525,
//   "type": "limit",
//   "size": 31431.0,
//   "reduceOnly": false,
//   "ioc": false,
//   "postOnly": false,
//   "clientId": null
// }

interface PlaceOrderDto {
  market: string;
  side: "sell" | "buy";
  price: number;
  type: "limit" | "market";
  size: number;
  reduceOnly: boolean;
  ioc: boolean;
  postOnly: boolean;
  clientId: string;
}
