import App from "./app";
import { cleanEnv, port } from "envalid";

cleanEnv(process.env, {
  PORT: port({ default: 3000 }),
});

const app = new App();

app.listen();
