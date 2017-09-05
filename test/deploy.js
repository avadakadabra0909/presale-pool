const chai = require('chai');

const server = require('./server');
const util = require('./util');

const expect = chai.expect;

describe('deploy', () => {
    let defaultPoolArgs = [0, 0, 0, true, []];
    let creator;
    let web3;

    before(async () => {
        let result = await server.setUp();
        web3 = result.web3;
        creator = result.addresses[0].toLowerCase();
    });

    after(() => {
        server.tearDown();
    });

    it('can be deployed without balance', async () => {
        let PresalePool = await util.deployContract(web3, "PresalePool", creator, defaultPoolArgs);
        let poolBalance = await web3.eth.getBalance(
            PresalePool.options.address
        );
        expect(poolBalance).to.equal(web3.utils.toWei(0, "ether"));
        expect(await util.getBalances(PresalePool)).to.deep.equal({});
    });

    it('can be deployed with balance', async () => {
        let fiveEth = web3.utils.toWei(5, "ether");
        let PresalePool = await util.deployContract(
            web3, "PresalePool", creator, defaultPoolArgs, fiveEth
        );

        let expectedBalances = {}
        expectedBalances[creator] = {
            remaining: fiveEth,
            contribution: web3.utils.toWei(0, "ether")
        }
        await util.verifyState(web3, PresalePool, expectedBalances, fiveEth);
    });
});

