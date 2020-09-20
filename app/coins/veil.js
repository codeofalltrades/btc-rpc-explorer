var Decimal = require("decimal.js");
Decimal8 = Decimal.clone({ precision: 8, rounding: 8 });

var currencyUnits = [
	{
		type: "native",
		name: "VEIL",
		multiplier: 1,
		default: true,
		values: ["", "veil", "VEIL"],
		decimalPlaces: 8
	},
	{
		type: "native",
		name: "mVEIL",
		multiplier: 1000,
		values: ["mveil"],
		decimalPlaces: 5
	},
	{
		type: "native",
		name: "bits",
		multiplier: 1000000,
		values: ["bits"],
		decimalPlaces: 2
	},
	{
		type: "native",
		name: "sat",
		multiplier: 100000000,
		values: ["sat", "satoshi"],
		decimalPlaces: 0
	}
];

module.exports = {
	name: "Veil",
	ticker: "Veil",
	logoUrl: "/img/logo/veil.png",
	siteTitle: "Veil Block Explorer",
	siteDescriptionHtml: "<b>Veil Block Explorer</b> is <a href='https://github.com/Veil-Project/veil-block-explorer). If you run your own [Veil Full Node](https://veil.org/en/full-node), **Veil Block Explorer** can easily run alongside it, communicating via RPC calls. See the project [ReadMe](https://github.com/Veil-Project/veil-block-explorer) for a list of features and instructions for running.",
	nodeTitle: "Veil Full Node",
	nodeUrl: "https://veil.org/en/full-node",
	demoSiteUrl: "https://testnet.veil-project.com/",
	miningPoolsConfigUrls: [],
	maxBlockWeight: 4000000,
	targetBlockTimeSeconds: 60,
	currencyUnits: currencyUnits,
	currencyUnitsByName: { "VEIL": currencyUnits[0], "mVEIL": currencyUnits[1], "bits": currencyUnits[2], "sat": currencyUnits[3] },
	baseCurrencyUnit: currencyUnits[3],
	defaultCurrencyUnit: currencyUnits[0],
	feeSatoshiPerByteBucketMaxima: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 50, 75, 100, 150],
	genesisBlockHashesByNetwork: {
		"main": "cd98c436136a211f982543eb5e21ea6e9fa483eae3852a70ff1a29efac8455f9",
		"test": "918ebe520f7666375d7e4dbb0c269f675440b96b0413ab92bbf28b85126197cd",
		"dev": "8caf05f423873ae32ad655c6003053583789b42ce532cfcdb065a2e8769ad23a",
		"regtest": "0f9188f13cb7b2c71f2a335e3a4fc328bf5beb436012afca590b1a11466e2206"
	},
	genesisCoinbaseTransactionIdsByNetwork: {
		"main": "6e674dee375335f275a9ebe7f89ba731e2d818d41897da8250e853ceb8241b79",
		"test": "503e28252d0111000dadec7bd60f8540102b9e2f337d1782d6a755276ba5a45b",
		"dev": "1f2bf6e3366b9670494792869eb557da4519590fdd23bf87efccdaa08716f573",
		"regtest": "4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b"
	},
	genesisCoinbaseTransactionsByNetwork: {
		"main": {}
	},
	genesisCoinbaseOutputAddressScripthash: "8b01df4e368ea28f8dc0423bcf7a4923e3a12d307c875e47a0cfbf90b5c39161",
	historicalData: [
		{}
	],
	exchangeRateData: {
		jsonUrl: "https://api.coindesk.com/v1/bpi/currentprice.json",
		responseBodySelectorFunction: function (responseBody) {
			//console.log("Exchange Rate Response: " + JSON.stringify(responseBody));

			var exchangedCurrencies = ["USD", "GBP", "EUR"];

			if (responseBody.bpi) {
				var exchangeRates = {};

				for (var i = 0; i < exchangedCurrencies.length; i++) {
					if (responseBody.bpi[exchangedCurrencies[i]]) {
						exchangeRates[exchangedCurrencies[i].toLowerCase()] = responseBody.bpi[exchangedCurrencies[i]].rate_float;
					}
				}

				return exchangeRates;
			}

			return null;
		}
	},
	blockRewardFunction: function (blockHeight, chain) {
		var eras = [new Decimal8(50)];
		for (var i = 1; i < 34; i++) {
			var previous = eras[i - 1];
			eras.push(new Decimal8(previous).dividedBy(2));
		}

		var halvingBlockInterval = (chain == "regtest" ? 150 : 518400);
		var index = Math.floor(blockHeight / halvingBlockInterval);

		return eras[index];
	}
};