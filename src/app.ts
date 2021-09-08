import AccountController from "./account.controller";
import MangoSimpleClient from "./mango.simple.client";
import MarketsController from "./markets.controller";
import OrdersController from "./orders.controller";
import WalletController from "./wallet.controller";
import Controller from "controller.interface";
import express from "express";
import log from "loglevel";

const bodyParser = require("body-parser");

class App {
  public app: express.Application;
  public mangoMarkets: MangoSimpleClient;

  constructor() {
    this.app = express();
    MangoSimpleClient.create().then((mangoSimpleClient) => {
      this.mangoMarkets = mangoSimpleClient;

      this.app.use(bodyParser.json({ limit: "50mb" }));

      this.initializeControllers([
        new WalletController(this.mangoMarkets),
        new OrdersController(this.mangoMarkets),
        new MarketsController(this.mangoMarkets),
        new AccountController(this.mangoMarkets),
      ]);
    });
  }

  private initializeControllers(controllers: Controller[]) {
    controllers.forEach((controller) => {
      this.app.use("/", controller.router);
    });
  }

  public listen() {
    this.app.listen(process.env.PORT, () => {
      log.info(`App listening on the port ${process.env.PORT}`);
    });
  }

  public getServer() {
    return this.app;
  }
}

export default App;
