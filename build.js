const fs = require("fs");

const solc = require('solc')

let compiledContract = solc.compile(
    fs.readFileSync("./contracts/PresalePool.sol", 'utf8'), 1
).contracts[":PresalePool"];

fs.writeFileSync("./contracts/PresalePool.json", compiledContract.interface);
fs.writeFileSync("./contracts/PresalePool.code", "0x"+compiledContract.bytecode);

