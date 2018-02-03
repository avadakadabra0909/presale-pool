const chai = require('chai');

const server = require('./server');
const util = require('./util');

const expect = chai.expect;
const BN = require('bn.js');


describe('setContributionSettings()', () => {
    let creator;
    let buyer1;
    let buyer2;
    let web3;
    let PBFeeManager;
    let PresalePoolLib;

    before(async () => {
        let result = await server.setUp();
        web3 = result.web3;
        creator = result.addresses[0].toLowerCase();
        buyer1 = result.addresses[1].toLowerCase();
        buyer2 = result.addresses[2].toLowerCase();
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

    it('limits cant exceed 1 billion eth', async () => {
        let billionEth = util.toWei(web3, 10**9, "ether");
        let moreThanBillionEth = util.toWei(web3, 1 + 10**9, "ether");

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(billionEth, billionEth, billionEth, []),
            creator
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.setContributionSettings(0, billionEth, moreThanBillionEth, []),
                creator
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.setContributionSettings(0, moreThanBillionEth, moreThanBillionEth, []),
                creator
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.setContributionSettings(moreThanBillionEth, moreThanBillionEth, moreThanBillionEth, []),
                creator
            )
        );
    });

    it('validates limits', async () => {
        // the call below succeeds if and only if minContribution <=  maxContribution <= maxPoolBalance
        // PresalePool.methods.setContributionSettings(minContribution, maxContribution, maxPoolBalance, [])
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.setContributionSettings(3, 2, 5, []),
                creator
            )
        );
        // maxPoolBalance must exceed maxContribution
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.setContributionSettings(0, 2, 1, []),
                creator
            )
        );
        // maxPoolBalance must exceed minContribution
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.setContributionSettings(2, 2, 1, []),
                creator
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.setContributionSettings(3, 2, 1, []),
                creator
            )
        );

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(0, 2, 3, []),
            creator
        );
        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(1, 2, 3, []),
            creator
        );
        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(0, 2, 2, []),
            creator
        );
        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(0, 0, 3, []),
            creator
        );
        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(0, 0, 0, []),
            creator
        );
    });

    it("rebalances when maxPoolBalance is decreased - 2 contributors", async () => {
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

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 5, "ether"),
                util.toWei(web3, 5, "ether"),
                []
            ),
            creator
        );

        let expectedBalances = {};
        expectedBalances[buyer1] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 5, "ether")
        };
        expectedBalances[buyer2] = {
            remaining: util.toWei(web3, 1, "ether"),
            contribution: util.toWei(web3, 0, "ether")
        };
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 6, "ether"));
    });

    it("rebalances when maxPoolBalance is decreased - 3 contributors", async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            util.toWei(web3, 5, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            util.toWei(web3, 5, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer2,
            util.toWei(web3, 5, "ether")
        );

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 15, "ether"),
                util.toWei(web3, 15, "ether"),
                []
            ),
            creator
        );

        let expectedBalances = {};
        expectedBalances[buyer1] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 5, "ether")
        };
        expectedBalances[buyer2] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 5, "ether")
        };
        expectedBalances[creator] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 5, "ether")
        };
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 15, "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 14, "ether"),
                util.toWei(web3, 14, "ether"),
                []
            ),
            creator
        );

        expectedBalances[buyer2] = {
            remaining: util.toWei(web3, 1, "ether"),
            contribution: util.toWei(web3, 4, "ether")
        };
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 15, "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 10, "ether"),
                util.toWei(web3, 10, "ether"),
                []
            ),
            creator
        );

        expectedBalances[buyer2] = {
            remaining: util.toWei(web3, 5, "ether"),
            contribution: util.toWei(web3, 0, "ether")
        };
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 15, "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 0, "ether"),
                util.toWei(web3, 0, "ether"),
                []
            ),
            creator
        );

        expectedBalances[buyer1] = {
            remaining: util.toWei(web3, 5, "ether"),
            contribution: util.toWei(web3, 0, "ether")
        };
        expectedBalances[creator] = {
            remaining: util.toWei(web3, 5, "ether"),
            contribution: util.toWei(web3, 0, "ether")
        };
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 15, "ether"));
    });

    it("rebalances when maxPoolBalance is decreased - admin contribution has priority", async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            util.toWei(web3, 5, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer2,
            util.toWei(web3, 5, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            util.toWei(web3, 5, "ether")
        );

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 15, "ether"),
                util.toWei(web3, 15, "ether"),
                []
            ),
            creator
        );

        let expectedBalances = {};
        expectedBalances[buyer1] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 5, "ether")
        };
        expectedBalances[buyer2] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 5, "ether")
        };
        expectedBalances[creator] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 5, "ether")
        };
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 15, "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 11, "ether"),
                util.toWei(web3, 11, "ether"),
                []
            ),
            creator
        );

        expectedBalances[buyer2] = {
            remaining: util.toWei(web3, 4, "ether"),
            contribution: util.toWei(web3, 1, "ether")
        };
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 15, "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 6, "ether"),
                util.toWei(web3, 6, "ether"),
                []
            ),
            creator
        );

        expectedBalances[buyer1] = {
            remaining: util.toWei(web3, 4, "ether"),
            contribution: util.toWei(web3, 1, "ether")
        };
        expectedBalances[buyer2] = {
            remaining: util.toWei(web3, 5, "ether"),
            contribution: util.toWei(web3, 0, "ether")
        };
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 15, "ether"));
    });

    it("rebalances when maxPoolBalance is decreased and is combined with minContribution", async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            util.toWei(web3, 5, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            util.toWei(web3, 5, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer2,
            util.toWei(web3, 5, "ether")
        );

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                util.toWei(web3, 4, "ether"),
                util.toWei(web3, 15, "ether"),
                util.toWei(web3, 15, "ether"),
                []
            ),
            creator
        );

        let expectedBalances = {};
        expectedBalances[buyer1] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 5, "ether")
        };
        expectedBalances[buyer2] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 5, "ether")
        };
        expectedBalances[creator] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 5, "ether")
        };
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 15, "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                util.toWei(web3, 4, "ether"),
                util.toWei(web3, 13, "ether"),
                util.toWei(web3, 13, "ether"),
                []
            ),
            creator
        );

        expectedBalances[buyer2] = {
            remaining: util.toWei(web3, 5, "ether"),
            contribution: util.toWei(web3, 0, "ether")
        };
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 15, "ether"));
    });

    it('rebalances on increases to maxContribution', async () => {
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
            contribution: util.toWei(web3, 5, "ether")
        };
        expectedBalances[buyer2] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 3, "ether")
        };
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 2, "ether"),
                util.toWei(web3, 50, "ether"),
                []
            ),
            creator
        );
        expectedBalances[buyer1] = {
            remaining: util.toWei(web3, 3, "ether"),
            contribution: util.toWei(web3, 2, "ether")
        };
        expectedBalances[buyer2] = {
            remaining: util.toWei(web3, 1, "ether"),
            contribution: util.toWei(web3, 2, "ether")
        };
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 2, "ether"),
                util.toWei(web3, 50, "ether"),
                [buyer1, buyer2]
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 3, "ether"),
                util.toWei(web3, 50, "ether"),
                []
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 3, "ether"),
                util.toWei(web3, 50, "ether"),
                [buyer1, buyer2]
            ),
            creator
        );
        expectedBalances[buyer1] = {
            remaining: util.toWei(web3, 2, "ether"),
            contribution: util.toWei(web3, 3, "ether")
        };
        expectedBalances[buyer2] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 3, "ether")
        };
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 3, "ether"),
                util.toWei(web3, 50, "ether"),
                []
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 3, "ether"),
                util.toWei(web3, 50, "ether"),
                [buyer1, buyer2]
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));
    });


    it('rebalances on increases to maxPoolBalance', async () => {
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
            contribution: util.toWei(web3, 5, "ether")
        };
        expectedBalances[buyer2] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 3, "ether")
        };
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 2, "ether"),
                util.toWei(web3, 2, "ether"),
                []
            ),
            creator
        );
        expectedBalances[buyer1] = {
            remaining: util.toWei(web3, 3, "ether"),
            contribution: util.toWei(web3, 2, "ether")
        };
        expectedBalances[buyer2] = {
            remaining: util.toWei(web3, 3, "ether"),
            contribution: util.toWei(web3, 0, "ether")
        };
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 2, "ether"),
                util.toWei(web3, 2, "ether"),
                [buyer1, buyer2]
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 6, "ether"),
                util.toWei(web3, 6, "ether"),
                []
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 6, "ether"),
                util.toWei(web3, 6, "ether"),
                [buyer1, buyer2]
            ),
            creator
        );
        expectedBalances[buyer1] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 5, "ether")
        };
        expectedBalances[buyer2] = {
            remaining: util.toWei(web3, 2, "ether"),
            contribution: util.toWei(web3, 1, "ether")
        };
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 6, "ether"),
                util.toWei(web3, 6, "ether"),
                []
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 6, "ether"),
                util.toWei(web3, 6, "ether"),
                [buyer1, buyer2]
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));
    });

    it('rebalances on increases to both maxContribution and maxPoolBalance', async () => {
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
            contribution: util.toWei(web3, 5, "ether")
        };
        expectedBalances[buyer2] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 3, "ether")
        };
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 1, "ether"),
                util.toWei(web3, 2, "ether"),
                []
            ),
            creator
        );
        expectedBalances[buyer1] = {
            remaining: util.toWei(web3, 4, "ether"),
            contribution: util.toWei(web3, 1, "ether")
        };
        expectedBalances[buyer2] = {
            remaining: util.toWei(web3, 2, "ether"),
            contribution: util.toWei(web3, 1, "ether")
        };
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 1, "ether"),
                util.toWei(web3, 2, "ether"),
                [buyer1, buyer2]
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 1, "ether"),
                util.toWei(web3, 2, "ether"),
                []
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 2, "ether"),
                util.toWei(web3, 2, "ether"),
                []
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 2, "ether"),
                util.toWei(web3, 2, "ether"),
                [buyer1, buyer2]
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 5, "ether"),
                util.toWei(web3, 6, "ether"),
                []
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));

        expectedBalances[buyer1] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 5, "ether")
        };
        expectedBalances[buyer2] = {
            remaining: util.toWei(web3, 2, "ether"),
            contribution: util.toWei(web3, 1, "ether")
        };
        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 5, "ether"),
                util.toWei(web3, 6, "ether"),
                [buyer1, buyer2]
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));
        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 5, "ether"),
                util.toWei(web3, 6, "ether"),
                []
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));
        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 5, "ether"),
                util.toWei(web3, 6, "ether"),
                [buyer1, buyer2]
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));

        expectedBalances[buyer1] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 5, "ether")
        };
        expectedBalances[buyer2] = {
            remaining: util.toWei(web3, 1, "ether"),
            contribution: util.toWei(web3, 2, "ether")
        };
        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 5, "ether"),
                util.toWei(web3, 7, "ether"),
                [buyer1, buyer2]
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));
    });


    it('rebalances on decreases to minContribution', async () => {
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
            contribution: util.toWei(web3, 5, "ether")
        };
        expectedBalances[buyer2] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 3, "ether")
        };
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                util.toWei(web3, 4, "ether"),
                util.toWei(web3, 50, "ether"),
                util.toWei(web3, 50, "ether"),
                []
            ),
            creator
        );
        expectedBalances[buyer2] = {
            remaining: util.toWei(web3, 3, "ether"),
            contribution: util.toWei(web3, 0, "ether")
        };
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));


        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 50, "ether"),
                util.toWei(web3, 50, "ether"),
                []
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 50, "ether"),
                util.toWei(web3, 50, "ether"),
                [buyer1, buyer2]
            ),
            creator
        );
        expectedBalances[buyer2] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 3, "ether")
        };
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 50, "ether"),
                util.toWei(web3, 50, "ether"),
                []
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));
        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                util.toWei(web3, 50, "ether"),
                util.toWei(web3, 50, "ether"),
                [buyer1, buyer2]
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));
    });

    it('rebalance operation ignores blacklisted participants', async () => {
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
            contribution: util.toWei(web3, 5, "ether")
        };
        expectedBalances[buyer2] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 3, "ether")
        };
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));

        await util.methodWithGas(
            PresalePool.methods.modifyWhitelist([], [buyer2]),
            creator
        );
        expectedBalances[buyer2] = {
            remaining: util.toWei(web3, 3, "ether"),
            contribution: util.toWei(web3, 0, "ether")
        };
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                util.toWei(web3, 0, "ether"),
                util.toWei(web3, 100, "ether"),
                util.toWei(web3, 100, "ether"),
                [buyer1, buyer2]
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));
        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                util.toWei(web3, 0, "ether"),
                util.toWei(web3, 100, "ether"),
                util.toWei(web3, 100, "ether"),
                []
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));
    });


    it('deposit respects contribution settings', async () => {
        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                util.toWei(web3, 1, "ether"),
                util.toWei(web3, 5, "ether"),
                util.toWei(web3, 10, "ether"),
                []
            ),
            creator
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.deposit(),
                creator,
                util.toWei(web3, 0.5, "ether")
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer1,
                util.toWei(web3, 0.5, "ether")
            )
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer1,
                util.toWei(web3, 6, "ether")
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.deposit(),
                creator,
                util.toWei(web3, 11, "ether")
            )
        );

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            util.toWei(web3, 6, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            util.toWei(web3, 4, "ether")
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer2,
                util.toWei(web3, 1, "ether")
            )
        );

        let expectedBalances = {};
        expectedBalances[buyer1] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 4, "ether")
        };
        expectedBalances[creator] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 6, "ether")
        };
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 10, "ether"));

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer1,
                util.toWei(web3, 0.5, "ether")
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.deposit(),
                creator,
                util.toWei(web3, 0.5, "ether")
            )
        );
    });

});

