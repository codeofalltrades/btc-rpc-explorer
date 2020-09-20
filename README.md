
# Veil Block Explorer

Simple, database-free Veil blockchain explorer, via RPC. Built with Node.js, express, bootstrap-v4.

This tool is intended to be a simple, self-hosted explorer for the Veil blockchain, driven by RPC calls to your own veild node. This tool is easy to run but currently lacks features compared to database-backed explorers.

Whatever reasons one might have for running a full node (trustlessness, technical curiosity, supporting the network, etc) it's helpful to appreciate the "fullness" of your node. With this explorer, you can not only explore the blockchain (in the traditional sense of the term "explorer"), but also explore the functional capabilities of your own node.

Live demo available at: [https://explorer.veil-project.com](https://explorer.veil-project.com)

# Features

* Browse blocks
* View block details
* View transaction details, with navigation "backward" via spent transaction outputs
* View JSON content used to generate most pages
* Search by transaction ID, block hash/height, and address
* Mempool summary, with fee, size, and age breakdowns
* RPC command browser and terminal (Demo Mode)
* View Peers (Demo Mode)

# Changelog / Release notes

See [CHANGELOG.md](/CHANGELOG.md).

# Getting started

The below instructions are geared toward Veil, but can be adapted easily to other coins.

## Prerequisites

1. Install and run a full, archiving node - [instructions](https://veil.org/en/full-node). Ensure that your veil node has full transaction indexing enabled (`txindex=1`) and the RPC server enabled (`server=1`).
2. Synchronize your node with the Veil network.
3. "Recent" version of Node.js (8+ recommended).

## Instructions

```bash
npm install -g veil-block-explorer
veil-block-explorer
```
or 
```cmd
powershell -ExecutionPolicy Bypass -File C:\Users\$env:USERNAME\AppData\Roaming\npm\veil-block-explorer.ps1 --veild-user veilrpc --veild-pass 1245 -P 58814
```
If you're running on mainnet with the default datadir and port, this Should Just Work.
Open [http://127.0.0.1:3002/](http://127.0.0.1:3002/) to view the explorer.

You may set configuration options in a `.env` file or using CLI args.
See [configuration](#configuration) for details.

### Configuration

Configuration options may be passed as environment variables
or by creating an env file at `~/.config/veil-block-explorer.env`
or at `.env` in the working directory.
See [.env-sample](.env-sample) for a list of the options and details for formatting `.env`.

You may also pass options as CLI arguments, for example:

```bash
veil-block-explorer --port 8080 --veild-port 58810 --veild-cookie ~/.veil/regtest/.cookie
```

See `veil-block-explorer --help` for the full list of CLI options.

## Run via Docker

1. `docker build -t veil-block-explorer .`
2. `docker run -p 3002:3002 -it veil-block-explorer`

# Support

