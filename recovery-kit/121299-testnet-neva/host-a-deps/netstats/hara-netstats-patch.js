const fs = require('fs');

function patchFile(path, transforms) {
  let text = fs.readFileSync(path, 'utf8');
  for (const [from, to] of transforms) {
    if (!text.includes(from)) {
      throw new Error(`Patch target not found in ${path}: ${from.slice(0, 80)}`);
    }
    text = text.replace(from, to);
  }
  fs.writeFileSync(path, text);
}

patchFile('/app/src/js/controllers.js', [
  [
    "\t$scope.avgBlockTime = 0;",
    "\t$scope.avgBlockTime = 5;"
  ],
  [
    "\t$scope.lastBlocksTime = _.fill(Array(MAX_BINS), 2);",
    "\t$scope.lastBlocksTime = _.fill(Array(MAX_BINS), 5);"
  ],
  [
    "\t$scope.latency = 0;",
    "\t$scope.latency = 0;\n\n\tvar HARA_QBFT_DIFFICULTY = 2;\n\tvar HARA_GEO_FALLBACK = {\n\t\t'validator1': {lat: 39.0438, lon: -77.4874, city: 'Virginia', country: 'United States'},\n\t\t'validator2': {lat: 39.0538, lon: -77.4774, city: 'Virginia', country: 'United States'},\n\t\t'validator3': {lat: 39.0638, lon: -77.4674, city: 'Virginia', country: 'United States'},\n\t\t'rpc1': {lat: 39.0738, lon: -77.4574, city: 'Virginia', country: 'United States'}\n\t};\n\tvar haraLastBestBlock = 0;\n\tvar haraLastBestBlockAt = 0;\n\tvar haraBlockTimeSamples = [];"
  ],
  [
    "\t\t\tcase \"charts\":\n\t\t\t\tif( !_.isEqual($scope.avgBlockTime, data.avgBlocktime) )\n\t\t\t\t\t$scope.avgBlockTime = data.avgBlocktime;",
    "\t\t\tcase \"charts\":\n\t\t\t\tif( data.avgBlocktime > 0 && !_.isEqual($scope.avgBlockTime, data.avgBlocktime) )\n\t\t\t\t\t$scope.avgBlockTime = data.avgBlocktime;"
  ],
  [
    "\t\t\t\tif( !_.isEqual($scope.lastBlocksTime, data.blocktime) && data.blocktime.length >= MAX_BINS )\n\t\t\t\t\t$scope.lastBlocksTime = data.blocktime;\n\n\t\t\t\tif( !_.isEqual($scope.difficultyChart, data.difficulty) && data.difficulty.length >= MAX_BINS )\n\t\t\t\t\t$scope.difficultyChart = data.difficulty;",
    "\t\t\t\tif( !_.isEqual($scope.lastBlocksTime, data.blocktime) && data.blocktime.length >= MAX_BINS && _.max(data.blocktime) > 0 )\n\t\t\t\t\t$scope.lastBlocksTime = data.blocktime;\n\n\t\t\t\tif( !_.isEqual($scope.difficultyChart, data.difficulty) && data.difficulty.length >= MAX_BINS )\n\t\t\t\t\t$scope.difficultyChart = _.map(data.difficulty, function() { return HARA_QBFT_DIFFICULTY; });"
  ],
  [
    "\tfunction updateActiveNodes()\n\t{\n\t\tupdateBestBlock();",
    "\tfunction updateActiveNodes()\n\t{\n\t\t_.forEach($scope.nodes, normalizeHaraNode);\n\t\tupdateBestBlock();"
  ],
  [
    "\t\t$scope.map = _.map($scope.nodes, function (node) {\n\t\t\tvar fill = $filter('bubbleClass')(node.stats, $scope.bestBlock);\n\n\t\t\tif(node.geo != null)\n\t\t\t\treturn {\n\t\t\t\t\tradius: 3,\n\t\t\t\t\tlatitude: node.geo.ll[0],\n\t\t\t\t\tlongitude: node.geo.ll[1],\n\t\t\t\t\tnodeName: node.info.name,\n\t\t\t\t\tfillClass: \"text-\" + fill,\n\t\t\t\t\tfillKey: fill,\n\t\t\t\t};\n\t\t\telse\n\t\t\t\treturn {\n\t\t\t\t\tradius: 0,\n\t\t\t\t\tlatitude: 0,\n\t\t\t\t\tlongitude: 0\n\t\t\t\t};\n\t\t});\n\t}",
    "\t\t$scope.map = _.map($scope.nodes, function (node) {\n\t\t\tvar fill = $filter('bubbleClass')(node.stats, $scope.bestBlock);\n\t\t\tvar geo = node.geo;\n\n\t\t\tif(geo != null && geo.ll != null)\n\t\t\t\treturn {\n\t\t\t\t\tradius: 5,\n\t\t\t\t\tlatitude: geo.ll[0],\n\t\t\t\t\tlongitude: geo.ll[1],\n\t\t\t\t\tnodeName: node.info.name,\n\t\t\t\t\tfillClass: \"text-\" + fill,\n\t\t\t\t\tfillKey: fill,\n\t\t\t\t};\n\n\t\t\treturn {\n\t\t\t\tradius: 0,\n\t\t\t\tlatitude: 0,\n\t\t\t\tlongitude: 0\n\t\t\t};\n\t\t});\n\t}\n\n\tfunction normalizeHaraNode(node)\n\t{\n\t\tif(_.isUndefined(node) || _.isUndefined(node.stats))\n\t\t\treturn;\n\n\t\tif(!_.isUndefined(node.stats.block))\n\t\t{\n\t\t\tnode.stats.block.difficulty = HARA_QBFT_DIFFICULTY;\n\t\t\tnode.stats.block.totalDifficulty = HARA_QBFT_DIFFICULTY;\n\t\t}\n\n\t\tvar name = ((node.info && node.info.name) || '').toLowerCase().replace(/[^a-z0-9]/g, '');\n\t\tvar fallback = HARA_GEO_FALLBACK[name];\n\n\t\tif((node.geo == null || node.geo.ll == null || node.geo.ll[0] === 0) && fallback)\n\t\t{\n\t\t\tnode.geo = {\n\t\t\t\tll: [fallback.lat, fallback.lon],\n\t\t\t\tcity: fallback.city,\n\t\t\t\tcountry: fallback.country\n\t\t\t};\n\t\t}\n\t}\n\n\tfunction updateHaraRealtimeBlockTime()\n\t{\n\t\tvar now = _.now();\n\n\t\tif(!$scope.bestBlock)\n\t\t\treturn;\n\n\t\tif(!haraLastBestBlock)\n\t\t{\n\t\t\tharaLastBestBlock = $scope.bestBlock;\n\t\t\tharaLastBestBlockAt = now;\n\t\t\treturn;\n\t\t}\n\n\t\tif($scope.bestBlock > haraLastBestBlock && haraLastBestBlockAt > 0)\n\t\t{\n\t\t\tvar deltaBlocks = $scope.bestBlock - haraLastBestBlock;\n\t\t\tvar sample = (now - haraLastBestBlockAt) / 1000 / deltaBlocks;\n\n\t\t\tif(sample > 0 && sample < 60)\n\t\t\t{\n\t\t\t\tfor(var i = 0; i < deltaBlocks; i++)\n\t\t\t\t{\n\t\t\t\t\tharaBlockTimeSamples.push(sample);\n\t\t\t\t\t$scope.lastBlocksTime.push(sample);\n\t\t\t\t}\n\n\t\t\t\tharaBlockTimeSamples = haraBlockTimeSamples.slice(-20);\n\t\t\t\t$scope.lastBlocksTime = $scope.lastBlocksTime.slice(-MAX_BINS);\n\t\t\t\t$scope.avgBlockTime = _.reduce(haraBlockTimeSamples, function(total, item) { return total + item; }, 0) / haraBlockTimeSamples.length;\n\t\t\t}\n\n\t\t\tharaLastBestBlock = $scope.bestBlock;\n\t\t\tharaLastBestBlockAt = now;\n\t\t}\n\t}"
  ],
  [
    "\t\t\t\t$scope.lastDifficulty = $scope.bestStats.block.difficulty;\n\t\t\t}\n\t\t}\n\t}",
    "\t\t\t\t$scope.bestStats.block.difficulty = HARA_QBFT_DIFFICULTY;\n\t\t\t\t$scope.bestStats.block.totalDifficulty = HARA_QBFT_DIFFICULTY;\n\t\t\t\t$scope.lastDifficulty = HARA_QBFT_DIFFICULTY;\n\t\t\t\t$scope.difficultyChart.push(HARA_QBFT_DIFFICULTY);\n\t\t\t\t$scope.difficultyChart = $scope.difficultyChart.slice(-MAX_BINS);\n\t\t\t\tupdateHaraRealtimeBlockTime();\n\t\t\t}\n\t\t}\n\t}"
  ]
]);

patchFile('/app/src/js/controllers.js', [
  [
    "\t$scope.lastGasLimit = _.fill(Array(MAX_BINS), 2);",
    "\t$scope.lastGasLimit = _.fill(Array(MAX_BINS), 0);"
  ],
  [
    "\t$scope.transactionDensity = _.fill(Array(MAX_BINS), 2);",
    "\t$scope.transactionDensity = _.fill(Array(MAX_BINS), 0);"
  ],
  [
    "\t$scope.gasSpending = _.fill(Array(MAX_BINS), 2);",
    "\t$scope.gasSpending = _.fill(Array(MAX_BINS), 0);"
  ],
  [
    "\t\t\t\tif( !_.isEqual($scope.lastGasLimit, data.gasLimit) && data.gasLimit.length >= MAX_BINS )\n\t\t\t\t\t$scope.lastGasLimit = data.gasLimit;",
    "\t\t\t\t// HARA: Besu native EthStats can send placeholder gasLimit chart values.\n\t\t\t\t// Realtime gasLimit is derived from observed best blocks instead."
  ],
  [
    "\t\t\t\tif( !_.isEqual($scope.transactionDensity, data.transactions) && data.transactions.length >= MAX_BINS )\n\t\t\t\t\t$scope.transactionDensity = data.transactions;\n\n\t\t\t\tif( !_.isEqual($scope.gasSpending, data.gasSpending) && data.gasSpending.length >= MAX_BINS )\n\t\t\t\t\t$scope.gasSpending = data.gasSpending;",
    "\t\t\t\t// HARA: transaction and gas spending charts are derived from latest blocks,\n\t\t\t\t// so empty blocks correctly remain at 0 instead of placeholder values."
  ],
  [
    "\n\tfunction updateHaraRealtimeBlockTime()",
    "\n\tfunction updateHaraRealtimeBlockStats()\n\t{\n\t\tvar block = $scope.bestStats && $scope.bestStats.block;\n\t\tif(_.isUndefined(block))\n\t\t\treturn;\n\n\t\tvar txCount = _.isArray(block.transactions) ? block.transactions.length : 0;\n\t\tvar gasUsed = parseInt(block.gasUsed || block.gasUsedValue || 0);\n\t\tvar gasLimit = parseInt(block.gasLimit || 0);\n\n\t\tif(isNaN(gasUsed))\n\t\t\tgasUsed = 0;\n\t\tif(isNaN(gasLimit))\n\t\t\tgasLimit = 0;\n\n\t\t$scope.transactionDensity.push(txCount);\n\t\t$scope.gasSpending.push(gasUsed);\n\t\t$scope.lastGasLimit.push(gasLimit);\n\n\t\t$scope.transactionDensity = $scope.transactionDensity.slice(-MAX_BINS);\n\t\t$scope.gasSpending = $scope.gasSpending.slice(-MAX_BINS);\n\t\t$scope.lastGasLimit = $scope.lastGasLimit.slice(-MAX_BINS);\n\t}\n\n\tfunction updateHaraRealtimeBlockTime()"
  ],
  [
    "\t\t\t\tupdateHaraRealtimeBlockTime();",
    "\t\t\t\tupdateHaraRealtimeBlockStats();\n\t\t\t\tupdateHaraRealtimeBlockTime();"
  ]
]);

patchFile('/app/src/js/filters.js', [
  [
    "\t\treturn result.toFixed(2) + ' ' + unit + 'H';",
    "\t\tif(hashes === 2 || hashes === '2')\n\t\t\treturn '2';\n\n\t\treturn result.toFixed(2) + ' ' + unit + 'H';"
  ]
]);

patchFile('/app/src/js/controllers.js', [
  [
    "\t\tvar name = ((node.info && node.info.name) || '').toLowerCase().replace(/[^a-z0-9]/g, '');\n\t\tvar fallback = HARA_GEO_FALLBACK[name];",
    "\t\tvar name = ((node.info && node.info.name) || '').toLowerCase().replace(/[^a-z0-9]/g, '');\n\t\tvar isValidator = name === 'validator1' || name === 'validator2' || name === 'validator3';\n\t\tnode.stats.mining = isValidator;\n\t\tif(!isValidator)\n\t\t\tnode.stats.hashrate = 0;\n\t\tvar fallback = HARA_GEO_FALLBACK[name];"
  ]
]);

patchFile('/app/src/js/directives.js', [
  [
    "\t\t\t\t\tvar width = 628,\n\t\t\t\t\t\theight = 202;",
    "\t\t\t\t\tvar width = Math.max(320, element.parent().width() || element.width() || 628),\n\t\t\t\t\t\theight = 242;"
  ],
  [
    "\t\t\t\t\t\twidth: width,\n\t\t\t\t\t\theight: 242,",
    "\t\t\t\t\t\twidth: width,\n\t\t\t\t\t\theight: height,"
  ]
]);

patchFile('/app/src/css/style.css', [
  [
    "body {\n\twidth: 100%;\n\tmin-width: 1900px;",
    "body {\n\twidth: 100%;\n\tmin-width: 1280px;"
  ],
  [
    "        overflow-x: hidden;",
    "        overflow-x: auto;"
  ],
  [
    "table td {\n\tfont-size: 14px;",
    "table td {\n\tfont-size: 12px;"
  ],
  [
    ".container-fluid {\n\tpadding-left: 30px;\n\tpadding-right: 30px;\n}",
    ".container-fluid {\n\tpadding-left: 12px;\n\tpadding-right: 12px;\n}"
  ],
  [
    ".big-info .icon-full-width i {\n\tdisplay: block;\n\twidth: 85px;\n\theight: 70px;\n\tfont-size: 70px;\n\tline-height: 70px;\n\tmargin-right: 15px;\n\tmargin-left: -15px;\n}",
    ".big-info .icon-full-width i {\n\tdisplay: block;\n\twidth: 68px;\n\theight: 58px;\n\tfont-size: 58px;\n\tline-height: 58px;\n\tmargin-right: 10px;\n\tmargin-left: -10px;\n}"
  ],
  [
    "span.small-title,\ndiv.small-title-miner {\n\tfont-weight: 700;\n\tfont-size: 14px;",
    "span.small-title,\ndiv.small-title-miner {\n\tfont-weight: 700;\n\tfont-size: 12px;"
  ],
  [
    ".big-info .big-details {\n\tdisplay: block;\n\tfont-weight: 200;\n\tfont-size: 50px;\n\tline-height: 55px;\n\tletter-spacing: -4px;",
    ".big-info .big-details {\n\tdisplay: block;\n\tfont-weight: 200;\n\tfont-size: 42px;\n\tline-height: 48px;\n\tletter-spacing: 0;"
  ],
  [
    "#mapHolder {\n\tposition: relative;\n\tdisplay: block;\n\twidth: 100%;\n\theight: 242px;",
    "#mapHolder {\n\tposition: relative;\n\tdisplay: block;\n\twidth: 100%;\n\theight: 242px;\n\tmin-width: 320px;"
  ]
]);
