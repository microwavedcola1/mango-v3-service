# Introduction
REST API Service for mango  markets version 3, and some simple clients and examples. Aimed to follow spec as close as possible to popular exchanges like ftx, etc. Motivation is that the experienced traders can bring their existing tools to mango markets. Service requires user to run a local copy with his/her own private key. See postman export to see what is already implemented.

Directory structure
```
.
├── README.md
├── mango-service-v3 - REST API Service for mango markets version 3
└── py               - python3 client for above REST API Service
```

# Documentation
See https://microwavedcola1.github.io/mango-service-v3/#tag/default

# Contributing
See Todos

# Todos
## Small
- cache various mango related things which change infrequently like e.g. spot+perp markets, placed orders for user, etc.
- combine instructions e.g. cancel+place-> modify, cancel many
- order types e.g. stop loss, market orders
- missing endpoints
  - funding rates?
  - maker taker fees
- populate still undefined fields in various endpoints
- identify which endpoints are still slow
- todos sprinkled over code
- when null vs when undefined as return field value,- doublecheck for every endpoint/dto
- how often to load/reload certain mango things e.g. account, cache, rootbanks, etc.?
- cleanup tsconfig.json
- add pre commit tools e.g. husky/pre-commit for code formatting and linting
## Large
- integration with freqtrade and/or ccxt https://github.com/ccxt/ccxt/blob/master/js/ftx.js
- integration with tradingview or https://github.com/thibaultyou/tradingview-alerts-processor/blob/master/docs/2_Alerts.md & https://www.tradingview.com/support/solutions/43000529348-about-webhooks/

## Community feedback
- requests https://twitter.com/microwavedcola1/status/1438439176194727937