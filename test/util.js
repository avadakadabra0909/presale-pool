const fs = require("fs");
const BigNumber = require('bignumber.js');
BigNumber.config({ DECIMAL_PLACES: 52, ROUNDING_MODE: BigNumber.ROUND_DOWN });
const chai = require('chai');
chai.use(require('chai-bignumber')(BigNumber));
const solc = require('solc');

const expect = chai.expect;

function toWei(web3, value, unit) {
    return web3.utils.toWei(value.toString(), unit);
}

function fromWei(web3, value, unit) {
    return web3.utils.fromWei(value.toString(), unit);
}

function findImports (name) {
    let filePath = `./contracts/${name}`;
    try {
        let source = fs.readFileSync(filePath, 'utf8');
        return { contents: source };
    } catch (error) {
        return { error: 'File not found' };
    }
}

let compileCache = {};

function compileContract(contractName, registryContract) {
    if (compileCache[contractName]) {
        return compileCache[contractName];
    }

    let content = fs.readFileSync(`./contracts/${contractName}.sol`, 'utf8');
    if (contractName === "PoolLib") {
        content = content.replace("0x123456789ABCDEF", `${registryContract.options.address}`);
    }
    let input = {};
    input[contractName] = content;

    let result = solc.compile(
        { sources: input }, 1, findImports
    );

    if(result.errors && result.errors.length > 0) {
        console.log(result.errors);
    }

    let compiledContract = result.contracts[`${contractName}:${contractName}`];
    if (contractName !== "PoolLib") {
        compileCache[contractName] = compiledContract;
    }
    return compiledContract;
}

async function deployCompiledContract(web3, bytecode, abi, creatorAddress, contractArgs, initialBalance) {
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

async function deployContract(web3, contractName, creatorAddress, contractArgs, initialBalance, libs) {
    let registryContract;
    if (contractName === "PoolLib") {
        registryContract = await deployContract(web3, "PoolRegistry", creatorAddress, [], 0);
    }
    let compiledContract = compileContract(contractName, registryContract);

    let bytecode = compiledContract.bytecode;
    if (libs) {
        bytecode = solc.linkBytecode(bytecode, libs);
    }

    let contract = await deployCompiledContract(
        web3,
        bytecode,
        compiledContract.interface,
        creatorAddress,
        contractArgs,
        initialBalance
    );
    contract.setProvider(web3.currentProvider);
    return contract;
}

function createPoolArgs(options) {
    let args = [];
    options = options || {};
    args.push(options.feeManager || "1111111111111111111111111111111111111111");
    args.push(options.creatorFeesPerEther || 0);
    args.push(options.minContribution || 0);
    args.push(options.maxContribution || 0);
    args.push(options.maxPoolBalance || 0);
    args.push(options.admins || []);
    args.push(options.restricted || false);
    args.push(options.totalTokenDrops || 0);
    args.push(options.autoDistributionWallet || "1111111111111111111111111111111111111111");
    args.push(options.code || 0);

    return args;
}

function expectVMException(prom) {
    return new Promise(
        function (resolve, reject) {
            prom.catch((e) => {
                expect(e.message).to.include("VM Exception");
                resolve(e);
            });
        }
    );
}

async function methodWithGas(method, from, value) {
    let txn = { from: from, gas: 1000000, gasPrice: 1};
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

/**
 * @param contribution InWei
 * @param poolContributionBalance InWei
 * @param {Number} feePercentage
 * @param gasCostPerContributor InWei
 * @param {Number} numContributors
 * @param totalTokensReceived total tokens received (without decimals)
 * @returns {BigNumber} The number of tokens received (not formatted)
 */
function getTokenShare(contribution, poolContributionBalance, feePercentage, gasCostPerContributor, numContributors, totalTokensReceived) {
    let numerator = contribution.sub(
        contribution.mul(feePercentage).round(0)
    )
    .sub(gasCostPerContributor);

    let denominator = poolContributionBalance.sub(
        poolContributionBalance.mul(feePercentage).round(0)
    ).sub(gasCostPerContributor.mul(numContributors));

    return numerator.mul(totalTokensReceived).div(denominator).round(0);
}

/**
 * @param web3
 * @param PresalePool contract
 * @param expectedBalances Object with address as property name and balance in wei as value
 * @param expectedPoolBalance Balance of the pool in Wei
 * @returns {Promise.<void>}
 */
async function verifyState(web3, PresalePool, expectedBalances, expectedPoolBalance) {
    let balances = await getBalances(PresalePool);

    let totalContribution = 0;
    let totalContributors = 0;
    Object.values(balances).forEach((value) => {
        let c = parseInt(value.contribution);
        totalContribution += c;
        if (c > 0) {
            totalContributors++;
        }
    });

    for (let [address, balance] of Object.entries(expectedBalances)) {
        expect(balances[address]).to.include(balance);
    }

    let contractBalance = await web3.eth.getBalance(
        PresalePool.options.address
    );
    expect(contractBalance).to.equal(expectedPoolBalance);

    let poolContributionBalance = await PresalePool.methods.poolContributionBalance().call();
    expect(parseInt(poolContributionBalance)).to.equal(totalContribution);

    expect(parseInt(
        await PresalePool.methods.totalContributors().call()
    )).to.equal(totalContributors);
}

async function expectBalanceChangeAddresses(web3, addresses, expectedDifference, operation) {
    return expectBalanceChanges(
        web3,
        addresses,
        Array(addresses.length).fill(expectedDifference),
        operation
    );
}

async function expectBalanceChanges(web3, addresses, differences, operation) {
    let beforeBalances = [];

    for (let i = 0; i < addresses.length; i++) {
        beforeBalances.push(await web3.eth.getBalance(addresses[i]));
    }
    await operation();

    for (let i = 0; i < addresses.length; i++) {
        let balanceAfterRefund = await web3.eth.getBalance(addresses[i]);
        let difference = parseInt(balanceAfterRefund) - parseInt(beforeBalances[i]);
        let expectedDifference = parseInt(differences[i]);
        if (expectedDifference === 0) {
            let differenceInEther = parseFloat(
                fromWei(web3, difference, "ether")
            );
            expect(differenceInEther).to.be.closeTo(0, 0.01);
        } else {
            expect(difference / expectedDifference).to.be.within(.98, 1.00001);
        }
    }
}

async function expectBalanceChange(web3, address, expectedDifference, operation) {
    expectedDifference = parseInt(expectedDifference);
    let balance = await web3.eth.getBalance(address);
    await operation();
    let balanceAfterRefund = await web3.eth.getBalance(address);
    let difference = parseInt(balanceAfterRefund) - parseInt(balance);
    if (expectedDifference === 0) {
        let differenceInEther = parseFloat(
            fromWei(web3, difference, "ether")
        );
        expect(differenceInEther).to.be.closeTo(0, 0.01);
    } else {
        expect(difference / expectedDifference).to.be.within(.98, 1.00001);
    }
}

async function tokenBalanceEquals(contract, address, amount) {
    const balance = new BigNumber(await contract.methods.balanceOf(address).call());
    expect(balance).to.be.bignumber.equal(amount);
}

function distributionGasCosts(options) {
    let { numContributors, numDrops, gasPriceGwei } = options;
    if (gasPriceGwei == null) {
        gasPriceGwei = 40 * Math.pow(10, 9);
    } else {
        gasPriceGwei *= Math.pow(10, 9);
    }
    return 150000 * numContributors * gasPriceGwei * numDrops;
}

module.exports = {
    BigNumber: BigNumber,
    toWei: toWei,
    fromWei: fromWei,
    createPoolArgs: createPoolArgs,
    deployContract: deployContract,
    distributionGasCosts: distributionGasCosts,
    expectBalanceChange: expectBalanceChange,
    expectBalanceChanges: expectBalanceChanges,
    expectBalanceChangeAddresses: expectBalanceChangeAddresses,
    expectVMException: expectVMException,
    getBalances: getBalances,
    methodWithGas: methodWithGas,
    verifyState: verifyState,
    tokenBalanceEquals: tokenBalanceEquals,
    getTokenShare: getTokenShare
};