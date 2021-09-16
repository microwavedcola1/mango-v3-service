import Controller from "./controller.interface";
import MangoSimpleClient from "./mango.simple.client";
import { OrderInfo } from "./types";
import { isValidMarket, logger } from "./utils";
import { PerpOrder } from "@blockworks-foundation/mango-client";
import { Order } from "@project-serum/serum/lib/market";
import { NextFunction, Request, Response, Router } from "express";
import { param, query, validationResult } from "express-validator";
import { BadParamError, BadRequestError } from "dtos";

class OrdersController implements Controller {
  public path = "/api/orders";
  public router = Router();

  constructor(public mangoSimpleClient: MangoSimpleClient) {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    // GET /orders?market={market_name}
    this.router.get(
      this.path,
      query("market").custom(isValidMarket).optional(),
      this.getOpenOrders
    );

    // POST /orders
    this.router.post(this.path, this.placeOrder);

    // // POST /orders/{order_id}/modify todo
    // this.router.post(this.path, this.modifyOrder);

    // DELETE /orders
    this.router.delete(this.path, this.cancelAllOrders);

    // DELETE /orders/{order_id}
    this.router.delete(`${this.path}/:order_id`, this.cancelOrderByOrderId);

    // DELETE /orders/by_client_id/{client_id}
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
    const errors = validationResult(request);
    if (!errors.isEmpty()) {
      return response.status(400).json({ errors: errors.array() as BadParamError[] });
    }

    const openOrders = await this.mangoSimpleClient.fetchAllBidsAndAsks(
      true,
      request.query.market ? String(request.query.market) : undefined
    );

    const orderDtos = openOrders.flat().map((orderInfo: OrderInfo) => {
      if ("bestInitial" in orderInfo.order) {
        const perpOrder = orderInfo.order as PerpOrder;
        return {
          createdAt: new Date(perpOrder.timestamp.toNumber() * 1000),
          filledSize: undefined,
          future: orderInfo.market.config.name,
          id: perpOrder.orderId.toString(),
          market: orderInfo.market.config.name,
          price: perpOrder.price,
          avgFillPrice: undefined,
          remainingSize: undefined,
          side: perpOrder.side,
          size: perpOrder.size,
          status: "open",
          type: undefined, // todo should this always be limit?
          reduceOnly: undefined,
          ioc: undefined,
          postOnly: undefined,
          clientId:
            perpOrder.clientId && perpOrder.clientId.toString() !== "0"
              ? perpOrder.clientId.toString()
              : undefined,
        } as OrderDto;
      }

      const spotOrder = orderInfo.order as Order;
      return {
        createdAt: undefined,
        filledSize: undefined,
        future: orderInfo.market.config.name,
        id: spotOrder.orderId.toString(),
        market: orderInfo.market.config.name,
        price: spotOrder.price,
        avgFillPrice: undefined,
        remainingSize: undefined,
        side: spotOrder.side,
        size: spotOrder.size,
        status: "open",
        type: undefined,
        reduceOnly: undefined,
        ioc: undefined,
        postOnly: undefined,
        clientId:
          spotOrder.clientId && spotOrder.clientId.toString() !== "0"
            ? spotOrder.clientId.toString()
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
    const placeOrderDto = request.body as PlaceOrderDto;
    logger.info("placing order...")
    // todo validation on placeOrderDto    
    // todo validation of marketname
    try {
      await this.mangoSimpleClient.placeOrder(
        placeOrderDto.market,
        placeOrderDto.type,
        placeOrderDto.side,
        placeOrderDto.size,
        placeOrderDto.price,
        placeOrderDto.ioc
          ? "ioc"
          : placeOrderDto.postOnly
          ? "postOnly"
          : "limit",
        placeOrderDto.clientId
      );
    } catch (error) {
      return response.status(400).send({
        errors: [{ msg: error.message } as BadRequestError],
      });
    }

    response.send({
      success: true,
      result: {
        createdAt: new Date(),
        filledSize: undefined,
        future: placeOrderDto.market,
        id: undefined,
        market: placeOrderDto.market,
        price: undefined,
        remainingSize: undefined,
        side: placeOrderDto.side,
        size: placeOrderDto.size,
        status: undefined,
        type: placeOrderDto.type,
        reduceOnly: undefined,
        ioc: placeOrderDto.ioc,
        postOnly: placeOrderDto.postOnly,
        clientId: placeOrderDto.clientId
          ? placeOrderDto.clientId.toString()
          : null,
      },
    } as PlaceOrderResponseDto);
  };

  private cancelAllOrders = async (
    request: Request,
    response: Response,
    next: NextFunction
  ) => {
    // todo log info
    // todo: leads to 429 if too many orders exist, needs optimization
    await this.mangoSimpleClient.cancelAllOrders();
    response.send();
  };

  private cancelOrderByOrderId = async (
    request: Request,
    response: Response,
    next: NextFunction
  ) => {
    // todo log info
    const orderId = request.params.order_id;
    this.mangoSimpleClient
      .getOrderByOrderId(orderId)
      .then((orderInfos) => {
        if (!orderInfos.length) {
          return response
            .status(400)
            .json({ errors: [{ msg: "Order not found!" }] });
        }
        this.mangoSimpleClient
          .cancelOrder(orderInfos[0])
          .then(() => response.send())
          .catch(() => {
            return response
              .status(400)
              .json({ errors: [{ msg: "Unexpected error occured!" }] });
          });
      })
      .catch(() => {
        return response
          .status(400)
          .json({ errors: [{ msg: "Unexpected error occured!" }] });
      });
  };

  private cancelOrderByClientId = async (
    request: Request,
    response: Response,
    next: NextFunction
  ) => {
    // todo log info
    const clientId = request.params.client_id;
    this.mangoSimpleClient
      .getOrderByClientId(clientId)
      .then((orderInfos) => {
        if (!orderInfos.length) {
          return response
            .status(400)
            .json({ errors: [{ msg: "Order not found!" }] });
        }
        this.mangoSimpleClient
          .cancelOrder(orderInfos[0])
          .then(() => response.send())
          .catch(() => {
            return response
              .status(400)
              .json({ errors: [{ msg: "Unexpected error occured!" }] });
          });
      })
      .catch(() => {
        return response
          .status(400)
          .json({ errors: [{ msg: "Unexpected error occured!" }] });
      });
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
  clientId: number; // todo: ftx uses string
}

interface PlaceOrderResponseDto {
  success: true;
  result: {
    createdAt: Date;
    filledSize: number;
    future: string;
    id: number;
    market: string;
    price: number;
    remainingSize: number;
    side: "buy" | "sell";
    size: number;
    status: "new" | "open" | "closed";
    type: "limit" | "market";
    reduceOnly: boolean;
    ioc: boolean;
    postOnly: boolean;
    clientId: string;
  };
}
