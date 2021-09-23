
A REST API server on top of mango markets v3, written in typescript + expressjs + using mango client and some other off chain REST services.

# How to run while developing
* expects your private key to be present in `~/.config/solana/id.json`
* `yarn install`
* `PORT=3000 GROUP=mainnet.1 CLUSTER_URL=https://api.mainnet-beta.solana.com yarn nodemon ./src/server.ts`

# How to run using docker
* `docker build . -t microwavedcola/mango-service-v3`
* `docker run -p 3000:3000 -e GROUP=mainnet.1 -e CLUSTER_URL=https://api.mainnet-beta.solana.com -v  ~/.config:/root/.config microwavedcola/mango-service-v3`

# Notes
You probably want to choose a private RPC node instead of the `https://api.mainnet-beta.solana.com` where one quickly ends up with HTTP 429s

# How to test
* via postman, see `service-v3.postman_collection.json`
* python client, see https://github.com/microwavedcola1/mango-v3-service/blob/master/py/README.md
