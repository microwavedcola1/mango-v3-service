import { logger } from "./utils";
import App from "./app";

const app = new App();

app.listen();

// todo add a handler for ctrl+c from docker
