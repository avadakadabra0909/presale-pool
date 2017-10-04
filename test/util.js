const fs = require("fs");
const chai = require('chai');
const solc = require('solc')

const expect = chai.expect;

function findImports (name) {
    let path = `./contracts/${name}`;
    try {
        let source = fs.readFileSync(path, 'utf8');
        return { contents: source };
    } catch (error) {
        return { error: 'File not found' };
    }
}

// already toplogically sorted
let libs = ["Util", "Fraction", "TokenCounter"];

function compileContract(contractName) {
    let content = fs.readFileSync(`./contracts/${contractName}.sol`, 'utf8');
    let = key = `${contractName}.sol`;
    let input = {};
    input[key] = content;

    let result = solc.compile(
        { sources: input }, 1, findImports
    );

    return result;
}

function contractNameToKey(contractName) {
    return `${contractName}.sol:${contractName}`;
}

async function deployCompiledContract(web3, compiledContract, creatorAddress, contractArgs, initialBalance) {
    let abi = compiledContract.interface;
    let bytecode = compiledContract.bytecode;
    let Contract = new web3.eth.Contract(JSON.parse(abi));
    let deploy = Contract.deploy({ data: bytecode, arguments: contractArgs });
    initialBalance = initialBalance || 0;

    let gasEstimate =  await deploy.estimateGas({ from: creatorAddress, value: initialBalance });

    let sendOptions = {
        from: creatorAddress,
        gas: gasEstimate,
        value: initialBalance
    };

    return await deploy.send(sendOptions);
}


async function deployContract(web3, contractName, creatorAddress, contractArgs, initialBalance) {
    let result = compileContract(contractName);
    let compiledContract = result.contracts[contractNameToKey(contractName)];
    let libMapping = {};

    for (let i= 0; i < libs.length; i++) {
        let key = contractNameToKey(libs[i]);
        let compiledLib = result.contracts[key];
        if (compiledLib) {
            let deployedLib = await deployCompiledContract(web3, compiledLib, creatorAddress, []);
            libMapping[key] = deployedLib.options.address;
        }
    }

    compiledContract.bytecode = solc.linkBytecode(compiledContract.bytecode, libMapping);

    return await deployCompiledContract(web3, compiledContract, creatorAddress, contractArgs, initialBalance);
}

function createPoolArgs(options) {
    let args = [];
    options = options || {};
    args.push(options.feeManager || "1111111111111111111111111111111111111111");
    args.push(options.feesPercentage || 0);
    args.push(options.minContribution || 0);
    args.push(options.maxContribution || 0);
    args.push(options.maxPoolBalance || 0);
    args.push(options.admins || []);
    args.push(options.restricted || false);

    return args;
}

function expectVMException(prom) {
    return new Promise(
        function (resolve, reject) {
            prom.catch((e) => {
                expect(e.message).to.include("invalid opcode")
                resolve(e);
            });
        }
    );
}

async function methodWithGas(method, from, value) {
    let txn = { from: from, gas: 1000000 };
    if (value) {
        txn.value = value;
    }
    return await method.send(txn);
}

async function getBalances(PresalePool) {
    let participantBalances = await PresalePool.methods.getParticipantBalances().call();
    let addresses = participantBalances[0];
    let contribution = participantBalances[1];
    let remaining = participantBalances[2];
    let whitelisted = participantBalances[3];
    let exists = participantBalances[4];

    expect(addresses.length)
    .to.equal(contribution.length)
    .to.equal(remaining.length)
    .to.equal(whitelisted.length)
    .to.equal(exists.length);

    let balances = {};
    contribution.forEach((val, i) => {
        balances[addresses[i].toLowerCase()] = {
            contribution: contribution[i],
            remaining: remaining[i],
            whitelisted: whitelisted[i],
            exists: exists[i]
        };
    });
    return balances;
}

async function verifyState(web3, PresalePool, expectedBalances, expectedPoolBalance) {
    let balances = await getBalances(PresalePool);

    let totalContribution = 0;
    Object.values(balances).forEach((value) => {
        totalContribution += parseInt(value.contribution);
    });

    for (let [address, balance] of Object.entries(expectedBalances)) {
        expect(balances[address]).to.include(balance);
    }

    let contractBalance = await web3.eth.getBalance(
        PresalePool.options.address
    );
    expect(contractBalance).to.equal(expectedPoolBalance);

    let poolBalance = await PresalePool.methods.poolBalance().call();
    expect(parseInt(poolBalance)).to.equal(totalContribution);
}

module.exports = {
    createPoolArgs: createPoolArgs,
    deployContract: deployContract,
    expectVMException: expectVMException,
    methodWithGas: methodWithGas,
    getBalances: getBalances,
    verifyState: verifyState,
}