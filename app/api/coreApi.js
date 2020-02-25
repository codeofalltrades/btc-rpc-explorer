var debug = require("debug");

var debugLog = debug("btcexp:core");

var LRU = require("lru-cache");
var fs = require('fs');

var utils = require("../utils.js");
var config = require("../config.js");
var coins = require("../coins.js");
var redisCache = require("../redisCache.js");
var Decimal = require("decimal.js");

// choose one of the below: RPC to a node, or mock data while testing
var rpcApi = require("./rpcApi.js");
//var rpcApi = require("./mockApi.js");


function onCacheEvent(cacheType, hitOrMiss, cacheKey) {
	//debugLog(`cache.${cacheType}.${hitOrMiss}: ${cacheKey}`);
}

function createMemoryLruCache(cacheObj) {
	return {
		get: function (key) {
			return new Promise(function (resolve, reject) {
				var val = cacheObj.get(key);

				if (val !== null) {
					onCacheEvent("memory", "hit", key);

				} else {
					onCacheEvent("memory", "miss", key);
				}

				resolve(cacheObj.get(key));
			});
		},
		set: function (key, obj, maxAge) { cacheObj.set(key, obj, maxAge); }
	}
}

var noopCache = {
	get: function (key) {
		return new Promise(function (resolve, reject) {
			resolve(null);
		});
	},
	set: function (key, obj, maxAge) { }
};

var miscCache = null;
var blockCache = null;
var txCache = null;

if (config.noInmemoryRpcCache) {
	miscCache = noopCache;
	blockCache = noopCache;
	txCache = noopCache;

} else {
	miscCache = createMemoryLruCache(new LRU(50));
	blockCache = createMemoryLruCache(new LRU(50));
	txCache = createMemoryLruCache(new LRU(200));
}

if (redisCache.active) {
	miscCache = redisCache;
	blockCache = redisCache;
	txCache = redisCache;
}




function getGenesisBlockHash() {
	return coins[config.coin].genesisBlockHashesByNetwork[global.activeBlockchain];
}

function getGenesisCoinbaseTransactionId() {
	return coins[config.coin].genesisCoinbaseTransactionIdsByNetwork[global.activeBlockchain];
}



function tryCacheThenRpcApi(cache, cacheKey, cacheMaxAge, rpcApiFunction, cacheConditionFunction) {
	//debugLog("tryCache: " + cacheKey + ", " + cacheMaxAge);
	if (cacheConditionFunction === null) {
		cacheConditionFunction = function (obj) {
			return true;
		};
	}

	return new Promise(function (resolve, reject) {
		var cacheResult = null;

		var finallyFunc = function () {
			if (cacheResult !== null) {
				resolve(cacheResult);

			} else {
				rpcApiFunction().then(function (rpcResult) {
					if (rpcResult !== null && cacheConditionFunction(rpcResult)) {
						cache.set(cacheKey, rpcResult, cacheMaxAge);
					}

					resolve(rpcResult);

				}).catch(function (err) {
					reject(err);
				});
			}
		};

		cache.get(cacheKey).then(function (result) {
			cacheResult = result;

			finallyFunc();

		}).catch(function (err) {
			utils.logError("nds9fc2eg621tf3", err, { cacheKey: cacheKey });

			finallyFunc();
		});
	});
}

function shouldCacheTransaction(tx) {
	if (!tx.confirmations) {
		return false;
	}

	if (tx.confirmations < 1) {
		return false;
	}

	if (tx.vin !== null && tx.vin.length > 9) {
		return false;
	}

	return true;
}



function getBlockchainInfo() {
	return tryCacheThenRpcApi(miscCache, "getBlockchainInfo", 10000, rpcApi.getBlockchainInfo);
}

function getNetworkInfo() {
	return tryCacheThenRpcApi(miscCache, "getNetworkInfo", 10000, rpcApi.getNetworkInfo);
}

function getNetTotals() {
	return tryCacheThenRpcApi(miscCache, "getNetTotals", 10000, rpcApi.getNetTotals);
}

function getMempoolInfo() {
	return tryCacheThenRpcApi(miscCache, "getMempoolInfo", 1000, rpcApi.getMempoolInfo);
}

function getMiningInfo() {
	return tryCacheThenRpcApi(miscCache, "getMiningInfo", 30000, rpcApi.getMiningInfo);
}

function getUptimeSeconds() {
	return tryCacheThenRpcApi(miscCache, "getUptimeSeconds", 1000, rpcApi.getUptimeSeconds);
}

function getChainTxStats(blockCount) {
	return tryCacheThenRpcApi(miscCache, "getChainTxStats-" + blockCount, 1200000, function () {
		return rpcApi.getChainTxStats(blockCount);
	});
}

function getTxCountStats(dataPtCount, blockStart, blockEnd) {
	return new Promise(function (resolve, reject) {
		var dataPoints = dataPtCount;

		getBlockchainInfo().then(function (getblockchaininfo) {
			if (typeof blockStart === "string") {
				if (["genesis", "first", "zero"].includes(blockStart)) {
					blockStart = 0;
				}
			}

			if (typeof blockEnd === "string") {
				if (["latest", "tip", "newest"].includes(blockEnd)) {
					blockEnd = getblockchaininfo.blocks;
				}
			}

			if (blockStart > blockEnd) {
				reject(`Error 37rhw0e7ufdsgf: blockStart (${blockStart}) > blockEnd (${blockEnd})`);

				return;
			}

			if (blockStart < 0) {
				blockStart += getblockchaininfo.blocks;
			}

			if (blockEnd < 0) {
				blockEnd += getblockchaininfo.blocks;
			}

			var chainTxStatsIntervals = [];
			for (var i = 0; i < dataPoints; i++) {
				chainTxStatsIntervals.push(parseInt(Math.max(10, getblockchaininfo.blocks - blockStart - i * (blockEnd - blockStart) / (dataPoints - 1) - 1)));
			}

			var promises = [];
			for (var ij = 0; ij < chainTxStatsIntervals.length; ij++) {
				promises.push(getChainTxStats(chainTxStatsIntervals[ij]));
			}

			Promise.all(promises).then(function (results) {
				var txStats = {
					txCounts: [],
					txLabels: [],
					txRates: []
				};

				for (var i = results.length - 1; i >= 0; i--) {
					if (results[i].window_tx_count) {
						txStats.txCounts.push({ x: (getblockchaininfo.blocks - results[i].window_block_count), y: (results[i].txcount - results[i].window_tx_count) });
						txStats.txRates.push({ x: (getblockchaininfo.blocks - results[i].window_block_count), y: (results[i].txrate) });
						txStats.txLabels.push(i);
					}
				}

				resolve({ txCountStats: txStats, getblockchaininfo: getblockchaininfo, totalTxCount: results[0].txcount });

			}).catch(function (err) {
				reject(err);
			});

		}).catch(function (err) {
			reject(err);
		});
	});
}

function getPeerSummary() {
	return new Promise(function (resolve, reject) {
		tryCacheThenRpcApi(miscCache, "getpeerinfo", 1000, rpcApi.getPeerInfo).then(function (getpeerinfo) {
			var result = {};
			result.getpeerinfo = getpeerinfo;

			var versionSummaryMap = {};
			for (var i = 0; i < getpeerinfo.length; i++) {
				var x = getpeerinfo[i];

				if (versionSummaryMap[x.subver] === null) {
					versionSummaryMap[x.subver] = 0;
				}

				versionSummaryMap[x.subver]++;
			}

			var versionSummary = [];
			for (var prop in versionSummaryMap) {
				if (versionSummaryMap.hasOwnProperty(prop)) {
					versionSummary.push([prop, versionSummaryMap[prop]]);
				}
			}

			versionSummary.sort(function (a, b) {
				if (b[1] > a[1]) {
					return 1;

				} else if (b[1] < a[1]) {
					return -1;

				} else {
					return a[0].localeCompare(b[0]);
				}
			});



			var servicesSummaryMap = {};
			for (var ik = 0; ik < getpeerinfo.length; ik++) {
				var x1 = getpeerinfo[ik];

				if (servicesSummaryMap[x.services] === null) {
					servicesSummaryMap[x.services] = 0;
				}

				servicesSummaryMap[x1.services]++;
			}

			var servicesSummary = [];
			for (var prop1 in servicesSummaryMap) {
				if (servicesSummaryMap.hasOwnProperty(prop1)) {
					servicesSummary.push([prop, servicesSummaryMap[prop1]]);
				}
			}

			servicesSummary.sort(function (a, b) {
				if (b[1] > a[1]) {
					return 1;

				} else if (b[1] < a[1]) {
					return -1;

				} else {
					return a[0].localeCompare(b[0]);
				}
			});



			result.versionSummary = versionSummary;
			result.servicesSummary = servicesSummary;

			resolve(result);

		}).catch(function (err) {
			reject(err);
		});
	});
}

function getMempoolDetails(start, count) {
	return new Promise(function (resolve, reject) {
		tryCacheThenRpcApi(miscCache, "getMempoolTxids", 1000, rpcApi.getMempoolTxids).then(function (resultTxids) {
			var txids = [];

			for (var i = start; (i < resultTxids.length && i < (start + count)); i++) {
				txids.push(resultTxids[i]);
			}

			getRawTransactions(txids).then(function (transactions) {
				var maxInputsTracked = config.site.txMaxInput;
				var vinTxids = [];
				for (var i = 0; i < transactions.length; i++) {
					var transaction = transactions[i];

					if (transaction && transaction.vin) {
						for (var j = 0; j < Math.min(maxInputsTracked, transaction.vin.length); j++) {
							if (transaction.vin[j].txid) {
								vinTxids.push(transaction.vin[j].txid);
							}
						}
					}
				}

				var txInputsByTransaction = {};
				getRawTransactions(vinTxids).then(function (vinTransactions) {
					var vinTxById = {};

					vinTransactions.forEach(function (tx) {
						vinTxById[tx.txid] = tx;
					});

					transactions.forEach(function (tx) {
						txInputsByTransaction[tx.txid] = {};

						if (tx && tx.vin) {
							for (var i = 0; i < Math.min(maxInputsTracked, tx.vin.length); i++) {
								if (vinTxById[tx.vin[i].txid]) {
									txInputsByTransaction[tx.txid][i] = vinTxById[tx.vin[i].txid];
								}
							}
						}
					});

					resolve({ txCount: resultTxids.length, transactions: transactions, txInputsByTransaction: txInputsByTransaction });

				}).catch(function (err) {
					reject(err);
				});

			}).catch(function (err) {
				reject(err);
			});

		}).catch(function (err) {
			reject(err);
		});
	});
}

function getMempoolStats() {
	return new Promise(function (resolve, reject) {
		tryCacheThenRpcApi(miscCache, "getRawMempool", 5000, rpcApi.getRawMempool).then(function (result) {
			var maxFee = 0;
			var maxFeePerByte = 0;
			var maxAge = 0;
			var maxSize = 0;
			var ages = [];
			var sizes = [];
			for (var txid in result) {
				var txMempoolInfo = result[txid];
				var fee = txMempoolInfo.modifiedfee;
				var size = txMempoolInfo.vsize ? txMempoolInfo.vsize : txMempoolInfo.size;
				var feePerByte = txMempoolInfo.modifiedfee / size;
				var age = Date.now() / 1000 - txMempoolInfo.time;

				if (fee > maxFee) {
					maxFee = txMempoolInfo.modifiedfee;
				}

				if (feePerByte > maxFeePerByte) {
					maxFeePerByte = txMempoolInfo.modifiedfee / size;
				}

				ages.push({ age: age, txid: txid });
				sizes.push({ size: size, txid: txid });

				if (age > maxAge) {
					maxAge = age;
				}

				if (size > maxSize) {
					maxSize = size;
				}
			}

			ages.sort(function (a, b) {
				if (a.age !== b.age) {
					return b.age - a.age;

				} else {
					return a.txid.localeCompare(b.txid);
				}
			});

			sizes.sort(function (a, b) {
				if (a.size !== b.size) {
					return b.size - a.size;

				} else {
					return a.txid.localeCompare(b.txid);
				}
			});

			maxSize = 2000;

			var satoshiPerByteBucketMaxima = coins[config.coin].feeSatoshiPerByteBucketMaxima;
			var bucketCount = satoshiPerByteBucketMaxima.length + 1;

			var satoshiPerByteBuckets = [];
			var satoshiPerByteBucketLabels = [];

			satoshiPerByteBucketLabels[0] = "[0 - " + satoshiPerByteBucketMaxima[0] + ")";
			for (var i = 0; i < bucketCount; i++) {
				satoshiPerByteBuckets[i] = { "count": 0, "totalFees": 0, "totalBytes": 0 };

				if (i > 0 && i < bucketCount - 1) {
					satoshiPerByteBucketLabels[i] = "[" + satoshiPerByteBucketMaxima[i - 1] + " - " + satoshiPerByteBucketMaxima[i] + ")";
				}
			}

			var ageBucketCount = 100;
			var ageBucketTxCounts = [];
			var ageBucketLabels = [];

			var sizeBucketCount = 100;
			var sizeBucketTxCounts = [];
			var sizeBucketLabels = [];

			for (var ij = 0; ij < ageBucketCount; ij++) {
				var rangeMin = ij * maxAge / ageBucketCount;
				var rangeMax = (ij + 1) * maxAge / ageBucketCount;

				ageBucketTxCounts.push(0);

				if (maxAge > 600) {
					var rangeMinutesMin = new Decimal(rangeMin / 60).toFixed(1);
					var rangeMinutesMax = new Decimal(rangeMax / 60).toFixed(1);

					ageBucketLabels.push(rangeMinutesMin + " - " + rangeMinutesMax + " min");

				} else {
					ageBucketLabels.push(parseInt(rangeMin) + " - " + parseInt(rangeMax) + " sec");
				}
			}

			for (var ik = 0; ik < sizeBucketCount; ik++) {
				sizeBucketTxCounts.push(0);

				if (ik === sizeBucketCount - 1) {
					sizeBucketLabels.push(parseInt(ik * maxSize / sizeBucketCount) + "+");

				} else {
					sizeBucketLabels.push(parseInt(ik * maxSize / sizeBucketCount) + " - " + parseInt((ik + 1) * maxSize / sizeBucketCount));
				}
			}

			satoshiPerByteBucketLabels[bucketCount - 1] = (satoshiPerByteBucketMaxima[satoshiPerByteBucketMaxima.length - 1] + "+");

			var summary = {
				"count": 0,
				"totalFees": 0,
				"totalBytes": 0,
				"satoshiPerByteBuckets": satoshiPerByteBuckets,
				"satoshiPerByteBucketLabels": satoshiPerByteBucketLabels,
				"ageBucketTxCounts": ageBucketTxCounts,
				"ageBucketLabels": ageBucketLabels,
				"sizeBucketTxCounts": sizeBucketTxCounts,
				"sizeBucketLabels": sizeBucketLabels
			};

			for (var txidCurrent in result) {
				var txMempoolInfo1 = result[txidCurrent];
				var fee1 = txMempoolInfo1.modifiedfee;
				var size1 = txMempoolInfo1.vsize ? txMempoolInfo1.vsize : txMempoolInfo1.size;
				var feePerByte1 = txMempoolInfo1.modifiedfee / size1;
				var satoshiPerByte1 = feePerByte1 * 100000000;
				var age1 = Date.now() / 1000 - txMempoolInfo1.time;

				var addedToBucket = false;
				for (var ix = 0; i < satoshiPerByteBucketMaxima.length; i++) {
					if (satoshiPerByteBucketMaxima[ix] > satoshiPerByte1) {
						satoshiPerByteBuckets[ix]["count"]++;
						satoshiPerByteBuckets[ix]["totalFees"] += fee1;
						satoshiPerByteBuckets[ix]["totalBytes"] += size1;

						addedToBucket = true;

						break;
					}
				}

				if (!addedToBucket) {
					satoshiPerByteBuckets[bucketCount - 1]["count"]++;
					satoshiPerByteBuckets[bucketCount - 1]["totalFees"] += fee1;
					satoshiPerByteBuckets[bucketCount - 1]["totalBytes"] += size1;
				}

				summary["count"]++;
				summary["totalFees"] += txMempoolInfo1.modifiedfee;
				summary["totalBytes"] += size1;

				var ageBucketIndex = Math.min(ageBucketCount - 1, parseInt(age1 / (maxAge / ageBucketCount)));
				var sizeBucketIndex = Math.min(sizeBucketCount - 1, parseInt(size / (maxSize / sizeBucketCount)));

				ageBucketTxCounts[ageBucketIndex]++;
				sizeBucketTxCounts[sizeBucketIndex]++;
			}

			summary["averageFee"] = summary["totalFees"] / summary["count"];
			summary["averageFeePerByte"] = summary["totalFees"] / summary["totalBytes"];

			summary["satoshiPerByteBucketMaxima"] = satoshiPerByteBucketMaxima;
			summary["satoshiPerByteBucketCounts"] = [];
			summary["satoshiPerByteBucketTotalFees"] = [];

			for (var il = 0; il < bucketCount; il++) {
				summary["satoshiPerByteBucketCounts"].push(summary["satoshiPerByteBuckets"][il]["count"]);
				summary["satoshiPerByteBucketTotalFees"].push(summary["satoshiPerByteBuckets"][il]["totalFees"]);
			}

			/*debugLog(JSON.stringify(ageBuckets));
			debugLog(JSON.stringify(ageBucketLabels));
			debugLog(JSON.stringify(sizeBuckets));
			debugLog(JSON.stringify(sizeBucketLabels));*/

			resolve(summary);

		}).catch(function (err) {
			reject(err);
		});
	});
}

function getBlockByHeight(blockHeight) {
	return tryCacheThenRpcApi(blockCache, "getBlockByHeight-" + blockHeight, 3600000, function () {
		return rpcApi.getBlockByHeight(blockHeight);
	});
}

function getBlocksByHeight(blockHeights) {
	return new Promise(function (resolve, reject) {
		var promises = [];
		for (var i = 0; i < blockHeights.length; i++) {
			promises.push(getBlockByHeight(blockHeights[i]));
		}

		Promise.all(promises).then(function (results) {
			resolve(results);

		}).catch(function (err) {
			reject(err);
		});
	});
}

function getBlocksByStartHeight(blockStartHeight) {
	return new Promise(function (resolve, reject) {
		var promises = [];
		getBlockchainInfo.then(function (blockData) {
			for (var i = blockData.blocks; i > blockStartHeight; i--) {
				promises.push(getBlockByHeight(blockHeights[i]));
			}
		});

		Promise.all(promises).then(function (results) {
			resolve(results);

		}).catch(function (err) {
			reject(err);
		});
	});
}

function getBlockTypeStatsByStartHeight(blockStartHeight) {
	return new Promise(function (resolve, reject) {
		let iMaxBlock = 0;
		let iPosCount = 0;
		let dPosDiff = 0;
		let iProgPowCount = 0;
		let dProgPowDiff = 0;
		let iRandomxCount = 0;
		let dRandomxDiff = 0;
		let iSha256dCount = 0;
		let dSha256dDiff = 0;
		getBlocksByStartHeight(blockStartHeight).then(function (blocks) {
			for (var i = 0; i < blocks.length - 1; i++) {
				if (blocks[i].height > iMaxBlock) {
					iMaxBlock = blocks[i].height;
				}
				switch (blocks[i].proof_type.toLowerCase()) {
					case 'proof-of-work (sha256d)':
						iSha256dCount++;
						if (dSha256dDiff === 0) { dSha256dDiff = blocks[i].difficulty; }
						break;
					case 'proof-of-work (randomx)':
						iRandomxCount++;
						if (dRandomxDiff === 0) { dRandomxDiff = blocks[i].difficulty; }
						break;
					case 'proof-of-work (progpow)':
						iProgPowCount++;
						if (dProgPowDiff === 0) { dProgPowDiff = blocks[i].difficulty; }
						break;
					default:
						iPosCount++;
						if (dPosDiff === 0) { dPosDiff = blocks[i].difficulty; }
				}
			}
		});

		var iBlockSampleSize = iMaxBlock - blockStartHeight;
		var dPosPercent = (iPosCount / iBlockSampleSize * 100).toFixed(2);
		var dSha256dPercent = (iSha256dCount / iBlockSampleSize * 100).toFixed(2);
		var dRandomxPercent = (iRandomxCount / iBlockSampleSize * 100).toFixed(2);
		var dProgPowPercent = (iProgPowCount / iBlockSampleSize * 100).toFixed(2);

		var oChainStats = {
			StartHeight: blockStartHeight,
			EndHeight: iMaxBlock,
			PosCount: iPosCount,
			PosDiff: dPosDiff,
			PosPercent: dPosPercent,
			Sha256dCount: iSha256dCount,
			Sha256dDiff: dSha256dDiff,
			Sha256dPercent: dSha256dPercent,
			RandomxCount: iRandomxCount,
			RandomxDiff: dRandomxDiff,
			RandomxPercent: dRandomxPercent,
			ProgPowCount: iProgPowCount,
			ProgPowDiff: dProgPowDiff,
			ProgPowPercent: dProgPowPercent
		};
		// Return it
		return oChainStats;
		//Promise.all(promises).then(function (results) {
		//	resolve(results);

		//}).catch(function (err) {
		//	reject(err);
		//});
	});
}

function getBlockByHash(blockHash) {
	return tryCacheThenRpcApi(blockCache, "getBlockByHash-" + blockHash, 3600000, function () {
		return rpcApi.getBlockByHash(blockHash);
	});
}

function getBlocksByHash(blockHashes) {
	return new Promise(function (resolve, reject) {
		var promises = [];
		for (var i = 0; i < blockHashes.length; i++) {
			promises.push(getBlockByHash(blockHashes[i]));
		}

		Promise.all(promises).then(function (results) {
			var result = {};

			results.forEach(function (item) {
				result[item.hash] = item;
			});

			resolve(result);

		}).catch(function (err) {
			reject(err);
		});
	});
}

function getRawTransaction(txid) {
	var rpcApiFunction = function () {
		return rpcApi.getRawTransaction(txid);
	};

	return tryCacheThenRpcApi(txCache, "getRawTransaction-" + txid, 3600000, rpcApiFunction, shouldCacheTransaction);
}

function getTxUtxos(tx) {
	return new Promise(function (resolve, reject) {
		var promises = [];

		for (var i = 0; i < tx.vout.length; i++) {
			promises.push(getUtxo(tx.txid, i));
		}

		Promise.all(promises).then(function (results) {
			resolve(results);

		}).catch(function (err) {
			reject(err);
		});
	});
}

function getUtxo(txid, outputIndex) {
	return new Promise(function (resolve, reject) {
		tryCacheThenRpcApi(miscCache, "utxo-" + txid + "-" + outputIndex, 3600000, function () {
			return rpcApi.getUtxo(txid, outputIndex);

		}).then(function (result) {
			// to avoid cache misses, rpcApi.getUtxo returns "0" instead of null
			if (result === "0") {
				resolve(null);

				return;
			}

			resolve(result);

		}).catch(function (err) {
			reject(err);
		});
	});
}

function getMempoolTxDetails(txid) {
	return tryCacheThenRpcApi(miscCache, "mempoolTxDetails-" + txid, 3600000, function () {
		return rpcApi.getMempoolTxDetails(txid);
	});
}

function getAddress(address) {
	return tryCacheThenRpcApi(miscCache, "getAddress-" + address, 3600000, function () {
		return rpcApi.getAddress(address);
	});
}

function getRawTransactions(txids) {
	return new Promise(function (resolve, reject) {
		var promises = [];
		for (var i = 0; i < txids.length; i++) {
			promises.push(getRawTransaction(txids[i]));
		}

		Promise.all(promises).then(function (results) {
			resolve(results);

		}).catch(function (err) {
			reject(err);
		});
	});
}

function getRawTransactionsWithInputs(txids, maxInputs = -1) {
	return new Promise(function (resolve, reject) {
		getRawTransactions(txids).then(function (transactions) {
			var maxInputsTracked = config.site.txMaxInput;

			if (maxInputs <= 0) {
				maxInputsTracked = 1000000;

			} else if (maxInputs > 0) {
				maxInputsTracked = maxInputs;
			}

			var vinTxids = [];
			for (var i = 0; i < transactions.length; i++) {
				var transaction = transactions[i];

				if (transaction && transaction.vin) {
					for (var j = 0; j < Math.min(maxInputsTracked, transaction.vin.length); j++) {
						if (transaction.vin[j].txid) {
							vinTxids.push(transaction.vin[j].txid);
						}
					}
				}
			}

			var txInputsByTransaction = {};
			getRawTransactions(vinTxids).then(function (vinTransactions) {
				var vinTxById = {};

				vinTransactions.forEach(function (tx) {
					vinTxById[tx.txid] = tx;
				});

				transactions.forEach(function (tx) {
					txInputsByTransaction[tx.txid] = {};

					if (tx && tx.vin) {
						for (var i = 0; i < Math.min(maxInputsTracked, tx.vin.length); i++) {
							if (vinTxById[tx.vin[i].txid]) {
								txInputsByTransaction[tx.txid][i] = vinTxById[tx.vin[i].txid];
							}
						}
					}
				});

				resolve({ transactions: transactions, txInputsByTransaction: txInputsByTransaction });
			});
		});
	});
}

function getBlockByHashWithTransactions(blockHash, txLimit, txOffset) {
	return new Promise(function (resolve, reject) {
		getBlockByHash(blockHash).then(function (block) {
			var txids = [];

			if (txOffset > 0) {
				txids.push(block.tx[0]);
			}

			for (var i = txOffset; i < Math.min(txOffset + txLimit, block.tx.length); i++) {
				txids.push(block.tx[i]);
			}

			getRawTransactions(txids).then(function (transactions) {
				if (transactions.length === txids.length) {
					block.coinbaseTx = transactions[0];
					block.totalFees = utils.getBlockTotalFeesFromCoinbaseTxAndBlockHeight(block.coinbaseTx, block.height);
					block.miner = utils.getMinerFromCoinbaseTx(block.coinbaseTx);
				}

				// if we're on page 2, we don't really want it anymore...
				if (txOffset > 0) {
					transactions.shift();
				}

				var maxInputsTracked = config.site.txMaxInput;
				var vinTxids = [];
				for (var i = 0; i < transactions.length; i++) {
					var transaction = transactions[i];

					if (transaction && transaction.vin) {
						for (var j = 0; j < Math.min(maxInputsTracked, transaction.vin.length); j++) {
							if (transaction.vin[j].txid) {
								vinTxids.push(transaction.vin[j].txid);
							}
						}
					}
				}

				var txInputsByTransaction = {};
				getRawTransactions(vinTxids).then(function (vinTransactions) {
					var vinTxById = {};

					vinTransactions.forEach(function (tx) {
						vinTxById[tx.txid] = tx;
					});

					transactions.forEach(function (tx) {
						txInputsByTransaction[tx.txid] = {};

						if (tx && tx.vin) {
							for (var i = 0; i < Math.min(maxInputsTracked, tx.vin.length); i++) {
								if (vinTxById[tx.vin[i].txid]) {
									txInputsByTransaction[tx.txid][i] = vinTxById[tx.vin[i].txid];
								}
							}
						}

						resolve({ getblock: block, transactions: transactions, txInputsByTransaction: txInputsByTransaction });
					});
				});
			});
		});
	});
}

function getHelp() {
	return new Promise(function (resolve, reject) {
		tryCacheThenRpcApi(miscCache, "getHelp", 3600000, rpcApi.getHelp).then(function (helpContent) {
			var lines = helpContent.split("\n");
			var sections = [];

			lines.forEach(function (line) {
				if (line.startsWith("==")) {
					var sectionName = line.substring(2);
					sectionName = sectionName.substring(0, sectionName.length - 2).trim();

					sections.push({ name: sectionName, methods: [] });

				} else if (line.trim().length > 0) {
					var methodName = line.trim();

					if (methodName.includes(" ")) {
						methodName = methodName.substring(0, methodName.indexOf(" "));
					}

					sections[sections.length - 1].methods.push({ name: methodName, content: line.trim() });
				}
			});

			resolve(sections);

		}).catch(function (err) {
			reject(err);
		});
	});
}

function getRpcMethodHelp(methodName) {
	var rpcApiFunction = function () {
		return rpcApi.getRpcMethodHelp(methodName);
	};

	return new Promise(function (resolve, reject) {
		tryCacheThenRpcApi(miscCache, "getHelp-" + methodName, 3600000, rpcApiFunction).then(function (helpContent) {
			var output = {};
			output.string = helpContent;

			var str = helpContent;

			var lines = str.split("\n");
			var argumentLines = [];
			var catchArgs = false;
			lines.forEach(function (line) {
				if (line.trim().length === 0) {
					catchArgs = false;
				}

				if (catchArgs) {
					argumentLines.push(line);
				}

				if (line.trim() === "Arguments:" || line.trim() === "Arguments") {
					catchArgs = true;
				}
			});

			var args = [];
			var argX = null;
			// looking for line starting with "N. " where N is an integer (1-2 digits)
			argumentLines.forEach(function (line) {
				var regex = /^([0-9]+)\.\s*"?(\w+)"?\s*\(([^,)]*),?\s*([^,)]*),?\s*([^,)]*),?\s*([^,)]*)?\s*\)\s*(.+)?$/;

				var match = regex.exec(line);

				if (match) {
					argX = {};
					argX.name = match[2];
					argX.detailsLines = [];

					argX.properties = [];

					if (match[3]) {
						argX.properties.push(match[3]);
					}

					if (match[4]) {
						argX.properties.push(match[4]);
					}

					if (match[5]) {
						argX.properties.push(match[5]);
					}

					if (match[6]) {
						argX.properties.push(match[6]);
					}

					if (match[7]) {
						argX.description = match[7];
					}

					args.push(argX);
				}

				if (!match && argX) {
					argX.detailsLines.push(line);
				}
			});

			output.args = args;

			resolve(output);

		}).catch(function (err) {
			reject(err);
		});
	});
}

function logCacheSizes() {
	var itemCounts = [miscCache.itemCount, blockCache.itemCount, txCache.itemCount];

	var stream = fs.createWriteStream("memoryUsage.csv", { flags: 'a' });
	stream.write("itemCounts: " + JSON.stringify(itemCounts) + "\n");
	stream.end();
}

module.exports = {
	getGenesisBlockHash: getGenesisBlockHash,
	getGenesisCoinbaseTransactionId: getGenesisCoinbaseTransactionId,
	getBlockchainInfo: getBlockchainInfo,
	getNetworkInfo: getNetworkInfo,
	getNetTotals: getNetTotals,
	getMempoolInfo: getMempoolInfo,
	getMiningInfo: getMiningInfo,
	getBlockByHeight: getBlockByHeight,
	getBlocksByHeight: getBlocksByHeight,
	getBlockByHash: getBlockByHash,
	getBlocksByHash: getBlocksByHash,
	getBlockByHashWithTransactions: getBlockByHashWithTransactions,
	getRawTransaction: getRawTransaction,
	getRawTransactions: getRawTransactions,
	getRawTransactionsWithInputs: getRawTransactionsWithInputs,
	getTxUtxos: getTxUtxos,
	getMempoolTxDetails: getMempoolTxDetails,
	getMempoolStats: getMempoolStats,
	getUptimeSeconds: getUptimeSeconds,
	getHelp: getHelp,
	getRpcMethodHelp: getRpcMethodHelp,
	getAddress: getAddress,
	logCacheSizes: logCacheSizes,
	getPeerSummary: getPeerSummary,
	getChainTxStats: getChainTxStats,
	getMempoolDetails: getMempoolDetails,
	getTxCountStats: getTxCountStats
};