# Introduction
REST API Service for mango  markets version 3, and some simple clients and examples.

# Aim
Aimed to follow spec as close as possible to popular exchanges like ftx, etc. 

# Motivation 
Traders should be able to bring their existing tools to mango markets. 

# Note
REST Service requires user to run a local copy with his/her own private key. An alternative approach which is known and was not taken is to prepare solana transactions in a centrally hosted REST API Service and send them back to the client for signing using their wallet. The advantages of this would be that we could have a centrally hosted service, and would save local hosting, the disadvantages of this would be complicating the REST clients users want to use with solana specific signing code and would need us to ship and mantain clients for various programming languages. Also such a centrally hosted service would then need authorization, authentication, rate limiting, etc. to prevent abuse of the configured RPC node which so far is not the aim of this project. 

# Documentation
See https://microwavedcola1.github.io/mango-service-v3/#tag/default

Directory structure
```
.
├── README.md
├── mango-service-v3 - REST API Service for mango markets version 3
└── py               - python3 client for above REST API Service
```
# Contributing
See Todos

# Todos
## Small
losely sorted in order of importance/priority
- error thrown in endpoints just crashes expressjs, need explicit handling
- rpc node related issues
  - how to ensure that order has been placed or definitely not placed?
  - off chain services might use other nodes, mixing data from various nodes, what if one node is behind?
- missing endpoints
  - stop loss, 
  - market orders
  - modify order
  - funding payments
- advanced order types e.g. split 
- populate still undefined fields in various endpoints
- cache various mango related things which change infrequently like e.g. spot+perp markets, placed orders for user, etc.
- identify which endpoints are still slow, comparison with ftx, you can use https://ftx.com/latency-stats to see how long your orders are taking to get through FTX’s engines (usually ~50ms), or just measure the time it takes a response to be received for your request for round trip time. FTX CLI isn’t focussed on being the absolute fastest, so you won’t be competing with HFT firms. FTX recommends AWS Tokyo as your trading instance base for the lowest latencies.
- todos sprinkled over code
- when null vs when undefined as return field value,- doublecheck for every endpoint/dto
- serum-history might be decomissioned, seek replacement
- how often to load/reload certain mango things e.g. account, cache, rootbanks, etc.?
- technical debt
  - cleanup tsconfig.json
  - add pre commit tools e.g. husky/pre-commit for code formatting and linting
## Large
- integration with freqtrade and/or ccxt https://github.com/ccxt/ccxt/blob/master/js/ftx.js
- integration with tradingview or https://github.com/thibaultyou/tradingview-alerts-processor/blob/master/docs/2_Alerts.md & https://www.tradingview.com/support/solutions/43000529348-about-webhooks/
- integrate with hummingbot

## Community feedback
- requests https://twitter.com/microwavedcola1/status/1438439176194727937