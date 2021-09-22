# mango-v3-service
A REST API server, aimed to follow spec as close as possible to popular exchanges like ftx, etc. Requires user to run a local copy with his/her own private key. See postman export to see what is already implemented.

# Contributing
Wip

# Pre-requisites
* expects your private key to be present in `~/.config/solana/id.json`

# How to run while developing
* `yarn install`
* `PORT=3000 GROUP=mainnet.1 CLUSTER_URL=https://api.mainnet-beta.solana.com nodemon ./src/server.ts`, you probably want to choose a private RPC node instead of the `https://api.mainnet-beta.solana.com` where one quickly ends up with 429s

# How to run using docker
* `docker build . -t microwavedcola/mango-service-v3`
* `docker run -p 3000:3000 -e GROUP=mainnet.1 -e CLUSTER_URL=https://api.mainnet-beta.solana.com -v  ~/.config:/root/.config microwavedcola/mango-service-v3`

# How to test
* via postman, see `service-v3.postman_collection.json`
* python client, see https://github.com/microwavedcola1/mango-v3-service/blob/master/py/README.md

# Todos
## Small
- cache things like e.g. markets, orders for user
- combine instructions e.g. cancel+place-> modify, cancel many
- missing endpoints
  - funding rates?
  - maker taker fees
- populate still undefined fields in various endpoints
- todos sprinkled over code
- identify which endpoints are still slow
- when null vs when undefined as return field value,- doublecheck for every endpoint/dto
- how often to load/reload certain mango things e.g. account, cache, rootbanks, etc.?
- cleanup tsconfig.json
- add pre commit tools e.g. husky/pre-commit for code formatting and linting
## Large
- integration with freqtrade and/or ccxt https://github.com/ccxt/ccxt/blob/master/js/ftx.js
- integration with tradingview or https://github.com/thibaultyou/tradingview-alerts-processor/blob/master/docs/2_Alerts.md & https://www.tradingview.com/support/solutions/43000529348-about-webhooks/

## Community feedback
- requests https://twitter.com/microwavedcola1/status/1438439176194727937
