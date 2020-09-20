#!/usr/bin/env node

const args = require('meow')(`
    Usage
      $ veil-block-explorer [options]

    Options
      -p, --port <port>              port to bind http server [default: 3002]
      -i, --host <host>              host to bind http server [default: 127.0.0.1]
      -a, --basic-auth-password <..> protect web interface with a password [default: no password]
      -C, --coin <coin>              crypto-coin to enable [default: BTC]

      -b, --VEILD-uri <uri>       connection URI for VEILD rpc (overrides the options below)
      -H, --VEILD-host <host>     hostname for VEILD rpc [default: 127.0.0.1]
      -P, --VEILD-port <port>     port for VEILD rpc [default: 58812]
      -c, --VEILD-cookie <path>   path to VEILD cookie file [default: ~/.veil/.cookie]
      -u, --VEILD-user <user>     username for VEILD rpc [default: none]
      -w, --VEILD-pass <pass>     password for VEILD rpc [default: none]

      --address-api <option>         api to use for address queries (options: electrumx, blockchain.com, blockchair.com, blockcypher.com) [default: none]
      -E, --electrumx-servers <..>   comma separated list of electrum servers to use for address queries; only used if --address-api=electrumx [default: none]

      --rpc-allowall                 allow all rpc commands [default: false]
      --rpc-blacklist <methods>      comma separated list of rpc commands to block [default: see in config.js]
      --cookie-secret <secret>       secret key for signed cookie hmac generation [default: hmac derive from VEILD pass]
      --demo                         enable demoSite mode [default: disabled]
      --no-rates                     disable fetching of currency exchange rates [default: enabled]
      --privacy-mode                 enable privacyMode to disable external data requests [default: disabled]
      --max-mem <bytes>              value for max_old_space_size [default: 1024 (1 GB)]

      --ganalytics-tracking <tid>    tracking id for google analytics [default: disabled]
      --sentry-url <sentry-url>      sentry url [default: disabled]

      -e, --node-env <env>           nodejs environment mode [default: production]
      -h, --help                     output usage information
      -v, --version                  output version number

    Examples
      $ veil-block-explorer --port 8080 --VEILD-port 18443 --VEILD-cookie ~/.veil/regtest/.cookie
      $ veil-block-explorer -p 8080 -P 18443 -c ~/.veil/regtest.cookie

    Or using connection URIs
      $ veil-block-explorer -b veil://bob:myPassword@127.0.0.1:18443/
      $ veil-block-explorer -b veil://127.0.0.1:18443/?cookie=$HOME/.veil/regtest/.cookie

    All options may also be specified as environment variables
      $ VEILEXP_PORT=8080 VEILEXP_VEILD_PORT=18443 VEILEXP_VEILD_COOKIE=~/.veil/regtest/.cookie veil-block-explorer


`, { flags: { port: {alias:'p'}, host: {alias:'i'}, basicAuthPassword: {alias:'a'}, coin: {alias:'C'}
            , VEILDUri: {alias:'b'}, VEILDHost: {alias:'H'}, VEILDPort: {alias:'P'}
            , VEILDCookie: {alias:'c'}, VEILDUser: {alias:'u'}, VEILDPass: {alias:'w'}
            , demo: {type:'boolean'}, rpcAllowall: {type:'boolean'}, electrumxServers: {alias:'E'}
            , nodeEnv: {alias:'e', default:'production'}
            , privacyMode: {type:'boolean'}
            } }
).flags;

const envify = k => k.replace(/([A-Z])/g, '_$1').toUpperCase();

Object.keys(args).filter(k => k.length > 1).forEach(k => {
  if (args[k] === false) process.env[`VEILEXP_NO_${envify(k)}`] = true;
  else process.env[`VEILEXP_${envify(k)}`] = args[k];
})

require('./www');
