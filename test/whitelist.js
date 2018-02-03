const chai = require('chai');

const server = require('./server');
const util = require('./util');

const expect = chai.expect;

describe('whitelist', () => {
    let creator;
    let buyer1;
    let buyer2;
    let buyer3;
    let web3;
    let PBFeeManager;
    let PresalePoolLib;

    before(async () => {
        let result = await server.setUp();
        web3 = result.web3;
        creator = result.addresses[0].toLowerCase();
        buyer1 = result.addresses[1].toLowerCase();
        buyer2 = result.addresses[2].toLowerCase();
        buyer3 = result.addresses[3].toLowerCase();
        let feeTeamMember = result.addresses[result.addresses.length-1].toLowerCase();
        PBFeeManager = await util.deployContract(
            web3,
            "PBFeeManager",
            creator,
            [
                [feeTeamMember],
                util.toWei(web3, 0.005, "ether"),
                util.toWei(web3, 0.01, "ether")
            ]
        );
        PresalePoolLib = await util.deployContract(
            web3,
            "PoolLib",
            creator,
            []
        );
    });

    after(async () => {
        await server.tearDown();
    });

    let PresalePool;
    beforeEach(async () => {
        PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                feeManager: PBFeeManager.options.address,
                maxContribution: util.toWei(web3, 50, "ether"),
                maxPoolBalance: util.toWei(web3, 50, "ether")
            }),
            0,
            { 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
        );
    });

    it('can add addresses not already in pool to whitelist', async () => {
        // can only be modified by creator
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.modifyWhitelist([buyer1], []),
                buyer1
            )
        );

        await util.methodWithGas(
            PresalePool.methods.modifyWhitelist([buyer1], [buyer3]),
            creator
        );

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            util.toWei(web3, 5, "ether")
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer2,
                util.toWei(web3, 1, "ether")
            )
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer3,
                util.toWei(web3, 1, "ether")
            )
        );

        let expectedBalances = {};
        expectedBalances[buyer1] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 5, "ether"),
        };
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 5, "ether"));
    });

    it('can backlist addresses who have contributions in the pool', async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            util.toWei(web3, 5, "ether")
        );

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer2,
            util.toWei(web3, 1, "ether")
        );

        let expectedBalances = {};
        expectedBalances[buyer1] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 5, "ether"),
        };
        expectedBalances[buyer2] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 1, "ether"),
        };
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 6, "ether"));

        await util.methodWithGas(
            PresalePool.methods.modifyWhitelist([], [buyer2]),
            creator
        );
        expectedBalances[buyer2].whitelisted = false;
        expectedBalances[buyer2].contribution = util.toWei(web3, 0, "ether");
        expectedBalances[buyer2].remaining = util.toWei(web3, 1, "ether");
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 6, "ether"));

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            util.toWei(web3, 5, "ether")
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer2,
                util.toWei(web3, 1, "ether")
            )
        );

        expectedBalances[buyer1].contribution = util.toWei(web3, 10, "ether");
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 11, "ether"));

        // can only be called by creator
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.removeWhitelist(),
                buyer1
            )
        );

        await util.methodWithGas(
            PresalePool.methods.removeWhitelist(),
            creator
        );
        expectedBalances[buyer2].contribution = util.toWei(web3, 1, "ether");
        expectedBalances[buyer2].remaining = util.toWei(web3, 0, "ether");
        expectedBalances[buyer2].whitelisted = true;
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 11, "ether"));

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer2,
            util.toWei(web3, 1, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer3,
            util.toWei(web3, 1, "ether")
        );
        expectedBalances[buyer2].contribution = util.toWei(web3, 2, "ether");
        expectedBalances[buyer3] = {
            contribution: util.toWei(web3, 1, "ether"),
            remaining: util.toWei(web3, 0, "ether"),
            whitelisted: true
        };
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 13, "ether"));
    });

    it('blacklisted addresses cannot do partial refunds', async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            util.toWei(web3, 5, "ether")
        );

        let expectedBalances = {};
        expectedBalances[buyer1] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 5, "ether"),
        };
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 5, "ether"));

        await util.methodWithGas(
            PresalePool.methods.modifyWhitelist([], [buyer1]),
            creator
        );
        expectedBalances[buyer1].whitelisted = false;
        expectedBalances[buyer1].contribution = util.toWei(web3, 0, "ether");
        expectedBalances[buyer1].remaining = util.toWei(web3, 5, "ether");
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 5, "ether"));

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.withdraw(util.toWei(web3, 1, "ether")),
                buyer1
            )
        );
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 5, "ether"));

        await util.methodWithGas(
            PresalePool.methods.withdrawAll(),
            buyer1
        );
        expectedBalances[buyer1].remaining = util.toWei(web3, 0, "ether");
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 0, "ether"));
    });

    it('including addresses in the whitelist respects max contribution limit', async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            util.toWei(web3, 5, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer2,
            util.toWei(web3, 7, "ether")
        );

        let expectedBalances = {};
        expectedBalances[buyer1] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 5, "ether"),
        };
        expectedBalances[buyer2] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 7, "ether"),
        };
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 12, "ether"));

        await util.methodWithGas(
            PresalePool.methods.modifyWhitelist([], [buyer2]),
            creator
        );
        expectedBalances[buyer2].whitelisted = false;
        expectedBalances[buyer2].contribution = util.toWei(web3, 0, "ether");
        expectedBalances[buyer2].remaining = util.toWei(web3, 7, "ether");
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 12, "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 5, "ether"),
                util.toWei(web3, 50, "ether"),
                []
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 12, "ether"));

        await util.methodWithGas(
            PresalePool.methods.modifyWhitelist([buyer2], []),
            creator
        );
        expectedBalances[buyer2].contribution = util.toWei(web3, 5, "ether");
        expectedBalances[buyer2].remaining = util.toWei(web3, 2, "ether");
        expectedBalances[buyer2].whitelisted = true;
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 12, "ether"));

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer2,
                util.toWei(web3, 1, "ether")
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer3,
                util.toWei(web3, 1, "ether")
            )
        );
    });

    it('including addresses in the whitelist respects max pool balance limit', async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            util.toWei(web3, 5, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer2,
            util.toWei(web3, 7, "ether")
        );

        let expectedBalances = {};
        expectedBalances[buyer1] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 5, "ether"),
        };
        expectedBalances[buyer2] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 7, "ether"),
        };
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 12, "ether"));

        await util.methodWithGas(
            PresalePool.methods.modifyWhitelist([], [buyer2]),
            creator
        );
        expectedBalances[buyer2].whitelisted = false;
        expectedBalances[buyer2].contribution = util.toWei(web3, 0, "ether");
        expectedBalances[buyer2].remaining = util.toWei(web3, 7, "ether");
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 12, "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 6, "ether"),
                util.toWei(web3, 6, "ether"),
                []
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 12, "ether"));

        await util.methodWithGas(
            PresalePool.methods.modifyWhitelist([buyer2], []),
            creator
        );
        expectedBalances[buyer2].contribution = util.toWei(web3, 1, "ether");
        expectedBalances[buyer2].remaining = util.toWei(web3, 6, "ether");
        expectedBalances[buyer2].whitelisted = true;
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 12, "ether"));

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer2,
                util.toWei(web3, 1, "ether")
            )
        );
    });

    it('including addresses in the whitelist respects min contribution threshold', async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            util.toWei(web3, 5, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer2,
            util.toWei(web3, 3, "ether")
        );

        let expectedBalances = {};
        expectedBalances[buyer1] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 5, "ether"),
        };
        expectedBalances[buyer2] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 3, "ether"),
        };
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));

        await util.methodWithGas(
            PresalePool.methods.modifyWhitelist([], [buyer2]),
            creator
        );
        expectedBalances[buyer2].whitelisted = false;
        expectedBalances[buyer2].contribution = util.toWei(web3, 0, "ether");
        expectedBalances[buyer2].remaining = util.toWei(web3, 3, "ether");
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                util.toWei(web3, 5, "ether"),
                util.toWei(web3, 50, "ether"),
                util.toWei(web3, 50, "ether"),
                []
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));

        await util.methodWithGas(
            PresalePool.methods.modifyWhitelist([buyer2], []),
            creator
        );
        expectedBalances[buyer2].whitelisted = true;
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer2,
                util.toWei(web3, 1, "ether")
            )
        );

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer2,
            util.toWei(web3, 2, "ether")
        );
        expectedBalances[buyer2].contribution = util.toWei(web3, 5, "ether");
        expectedBalances[buyer2].remaining = util.toWei(web3, 0, "ether");
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 10, "ether"));
    });
});

