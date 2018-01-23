const chai = require('chai');

const server = require('./server');
const util = require('./util');

const expect = chai.expect;

describe('expectRefund', () => {
    let creator;
    let buyer1;
    let buyer2;
    let teamMember;
    let web3;
    let PBFeeManager;
    let poolFee = 0.005;
    let PresalePoolLib;

    before(async () => {
        let result = await server.setUp();
        web3 = result.web3;
        creator = result.addresses[0].toLowerCase();
        buyer1 = result.addresses[1].toLowerCase();
        buyer2 = result.addresses[2].toLowerCase();
        teamMember = result.addresses[3].toLowerCase();
        payoutAddress = result.addresses[4].toLowerCase();
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


    function assertRefund(PresalePool, participant, expectedDifference) {
        return util.expectBalanceChange(web3, participant, expectedDifference, () =>{
            return util.methodWithGas(
                PresalePool.methods.withdrawAll(), participant
            );
        });
    }

    describe("without token drops", () => {
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

        it("cant be called from open state", async () => {
            await util.expectVMException(
                util.methodWithGas(
                    PresalePool.methods.expectRefund(payoutAddress),
                    creator
                )
            );

            await util.expectVMException(
                web3.eth.sendTransaction({
                    from: payoutAddress,
                    to: PresalePool.options.address,
                    value: util.toWei(web3, 3, "ether")
                })
            );
        });

        it("cant be called from failed state", async () => {
            await util.methodWithGas(PresalePool.methods.fail(), creator);

            await util.expectVMException(
                util.methodWithGas(
                    PresalePool.methods.expectRefund(payoutAddress),
                    creator
                )
            );

            await util.expectVMException(
                web3.eth.sendTransaction({
                    from: payoutAddress,
                    to: PresalePool.options.address,
                    value: util.toWei(web3, 3, "ether")
                })
            );
        });

        it("refund state does not allow deposits", async () => {
            await util.methodWithGas(
                PresalePool.methods.deposit(),
                creator,
                util.toWei(web3, 2, "ether")
            );
            await util.methodWithGas(
                PresalePool.methods.payToPresale(payoutAddress, 0, 0, '0x'),
                creator
            );
            await util.methodWithGas(
                PresalePool.methods.expectRefund(buyer2),
                creator
            );

            await util.expectVMException(
                util.methodWithGas(
                    PresalePool.methods.deposit(),
                    buyer2,
                    util.toWei(web3, 2, "ether")
                )
            );
        });

        it("refund transactions to fail if address does not match refundSenderAddress", async () => {
            await util.methodWithGas(
                PresalePool.methods.deposit(),
                creator,
                util.toWei(web3, 2, "ether")
            );
            await util.methodWithGas(
                PresalePool.methods.payToPresale(payoutAddress, 0, 0, '0x'),
                creator
            );
            await util.methodWithGas(
                PresalePool.methods.expectRefund(buyer2),
                creator
            );

            await util.expectVMException(
                web3.eth.sendTransaction({
                    from: payoutAddress,
                    to: PresalePool.options.address,
                    value: util.toWei(web3, 2, "ether")
                })
            );

            await util.expectVMException(
                web3.eth.sendTransaction({
                    from: creator,
                    to: PresalePool.options.address,
                    value: util.toWei(web3, 2, "ether")
                })
            );

            await web3.eth.sendTransaction({
                from: buyer2,
                to: PresalePool.options.address,
                value: util.toWei(web3, 2, "ether")
            });

            await assertRefund(PresalePool, creator, util.toWei(web3, 2*(1 + poolFee), "ether"));
        });

        it("accepts multiple refund transactions", async () => {
            await util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer2,
                util.toWei(web3, 3, "ether")
            );
            await util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer1,
                util.toWei(web3, 1, "ether")
            );
            await util.methodWithGas(
                PresalePool.methods.payToPresale(payoutAddress, 0, 0, '0x'),
                creator
            );
            await util.methodWithGas(
                PresalePool.methods.expectRefund(payoutAddress),
                creator
            );

            await web3.eth.sendTransaction({
                from: payoutAddress,
                to: PresalePool.options.address,
                value: util.toWei(web3, 1, "ether")
            });

            await assertRefund(PresalePool, buyer2, util.toWei(web3, 0.75 + 3*poolFee, "ether"));
            await assertRefund(PresalePool, buyer2, 0);

            await web3.eth.sendTransaction({
                from: payoutAddress,
                to: PresalePool.options.address,
                value: util.toWei(web3, 3, "ether")
            });

            await assertRefund(PresalePool, buyer2, util.toWei(web3, 2.25, "ether"));
            await assertRefund(PresalePool, buyer2, 0);
            await assertRefund(PresalePool, buyer1, util.toWei(web3, 1 + poolFee, "ether"));
            await assertRefund(PresalePool, buyer1, 0);
        });

        it("accepts multiple refund transactions from different senders", async () => {
            await util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer2,
                util.toWei(web3, 3, "ether")
            );
            await util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer1,
                util.toWei(web3, 1, "ether")
            );
            await util.methodWithGas(
                PresalePool.methods.payToPresale(payoutAddress, 0, 0, '0x'),
                creator
            );

            await util.methodWithGas(
                PresalePool.methods.expectRefund(payoutAddress),
                creator
            );
            await web3.eth.sendTransaction({
                from: payoutAddress,
                to: PresalePool.options.address,
                value: util.toWei(web3, 1, "ether")
            });

            await assertRefund(PresalePool, buyer2, util.toWei(web3, 0.75 + 3*poolFee, "ether"));
            await assertRefund(PresalePool, buyer2, 0);

            await util.methodWithGas(
                PresalePool.methods.expectRefund(creator),
                creator
            );
            await util.expectVMException(
                web3.eth.sendTransaction({
                    from: payoutAddress,
                    to: PresalePool.options.address,
                    value: util.toWei(web3, 3, "ether")
                })
            );
            await web3.eth.sendTransaction({
                from: creator,
                to: PresalePool.options.address,
                value: util.toWei(web3, 3, "ether")
            });

            await assertRefund(PresalePool, buyer2, util.toWei(web3, 2.25, "ether"));
            await assertRefund(PresalePool, buyer2, 0);
            await assertRefund(PresalePool, buyer1, util.toWei(web3, 1 + poolFee, "ether"));
            await assertRefund(PresalePool, buyer1, 0);
        });

        it("dont allow refunds if tokens are confirmed", async () => {
            await util.methodWithGas(
                PresalePool.methods.deposit(),
                creator,
                util.toWei(web3, 2, "ether")
            );

            let TestToken = await util.deployContract(web3, "TestToken", creator, [buyer2]);
            await util.methodWithGas(
                PresalePool.methods.payToPresale(TestToken.options.address, 0, 0, '0x'),
                creator
            );

            await util.methodWithGas(
                PresalePool.methods.confirmTokens(
                    TestToken.options.address, false
                ),
                creator
            );

            await util.expectVMException(
                util.methodWithGas(
                    PresalePool.methods.expectRefund(payoutAddress),
                    creator
                )
            );

            await util.expectVMException(
                web3.eth.sendTransaction({
                    from: payoutAddress,
                    to: PresalePool.options.address,
                    value: util.toWei(web3, 3, "ether")
                })
            );
        });

        it("allow refunds which exceed original amount", async () => {
            await util.methodWithGas(
                PresalePool.methods.deposit(),
                creator,
                util.toWei(web3, 2, "ether")
            );
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
            expectedBalances[creator] = {
                remaining: util.toWei(web3, 0, "ether"),
                contribution: util.toWei(web3, 2, "ether")
            };
            expectedBalances[buyer1] = {
                remaining: util.toWei(web3, 0, "ether"),
                contribution: util.toWei(web3, 5, "ether")
            };
            expectedBalances[buyer2] = {
                remaining: util.toWei(web3, 0, "ether"),
                contribution: util.toWei(web3, 1, "ether")
            };
            await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));

            await util.methodWithGas(
                PresalePool.methods.setContributionSettings(
                    0, util.toWei(web3, 2, "ether"), util.toWei(web3, 3, "ether"), []
                ),
                creator
            );
            expectedBalances[creator] = {
                remaining: util.toWei(web3, 0, "ether"),
                contribution: util.toWei(web3, 2, "ether")
            };
            expectedBalances[buyer1] = {
                remaining: util.toWei(web3, 4, "ether"),
                contribution: util.toWei(web3, 1, "ether")
            };
            expectedBalances[buyer2] = {
                remaining: util.toWei(web3, 1, "ether"),
                contribution: util.toWei(web3, 0, "ether")
            };
            await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));

            await util.methodWithGas(
                PresalePool.methods.payToPresale(payoutAddress, 0, 0, '0x'),
                creator
            );

            await util.methodWithGas(
                PresalePool.methods.expectRefund(payoutAddress),
                creator
            );

            await web3.eth.sendTransaction({
                from: payoutAddress,
                to: PresalePool.options.address,
                value: util.toWei(web3, 63, "ether")
            });

            await util.expectBalanceChanges(
                web3,
                [creator, buyer1, buyer2],
                [
                    util.toWei(web3, 42 + 2*poolFee, "ether"),
                    util.toWei(web3, 25 + poolFee, "ether"),
                    util.toWei(web3, 1, "ether")
                ],
                () => {
                    return util.methodWithGas(
                        PresalePool.methods.withdrawAllForMany([creator, buyer1, buyer2]),
                        payoutAddress
                    )
                }
            );
        });
    });

    describe("with token drops", () => {
        let PresalePool;
        beforeEach(async () => {
            PresalePool = await util.deployContract(
                web3,
                "PresalePool",
                creator,
                util.createPoolArgs({
                    feeManager: PBFeeManager.options.address,
                    minContribution: util.toWei(web3, 0.5, "ether"),
                    maxContribution: util.toWei(web3, 50, "ether"),
                    maxPoolBalance: util.toWei(web3, 50, "ether"),
                    totalTokenDrops: 2
                }),
                0,
                { 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
            );

            await util.methodWithGas(
                PresalePool.methods.deposit(),
                creator,
                util.toWei(web3, 2, "ether")
            );
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
            expectedBalances[creator] = {
                remaining: util.toWei(web3, 0, "ether"),
                contribution: util.toWei(web3, 2, "ether")
            };
            expectedBalances[buyer1] = {
                remaining: util.toWei(web3, 0, "ether"),
                contribution: util.toWei(web3, 5, "ether")
            };
            expectedBalances[buyer2] = {
                remaining: util.toWei(web3, 0, "ether"),
                contribution: util.toWei(web3, 1, "ether")
            };
            await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));

            await util.methodWithGas(
                PresalePool.methods.setContributionSettings(
                    util.toWei(web3, 0.5, "ether"),
                    util.toWei(web3, 2, "ether"),
                    util.toWei(web3, 3, "ether"),
                    []
                ),
                creator
            );
            expectedBalances[creator] = {
                remaining: util.toWei(web3, 0, "ether"),
                contribution: util.toWei(web3, 2, "ether")
            };
            expectedBalances[buyer1] = {
                remaining: util.toWei(web3, 4, "ether"),
                contribution: util.toWei(web3, 1, "ether")
            };
            expectedBalances[buyer2] = {
                remaining: util.toWei(web3, 1, "ether"),
                contribution: util.toWei(web3, 0, "ether")
            };
            await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));

            let balanceBeforePayout = parseInt(await web3.eth.getBalance(payoutAddress));
            await util.methodWithGas(
                PresalePool.methods.payToPresale(payoutAddress, 0, 0, '0x'),
                creator
            );
            let balanceAfterPayout = parseInt(await web3.eth.getBalance(payoutAddress));


            await util.methodWithGas(
                PresalePool.methods.expectRefund(payoutAddress),
                creator
            );

            await web3.eth.sendTransaction({
                from: payoutAddress,
                to: PresalePool.options.address,
                value: balanceAfterPayout - balanceBeforePayout
            });

        });

        it("withdrawForMany sends the correct amount", async () => {
            let originalContribution = parseInt(util.toWei(web3, 2, "ether"));
            let gasCosts = util.distributionGasCosts({
                numContributors: 1, numDrops: 2
            });
            let expectedReturns = [
                parseInt(util.toWei(web3, 2, "ether")) - gasCosts,
                parseInt(util.toWei(web3, 5, "ether")) - gasCosts,
                parseInt(util.toWei(web3, 1, "ether")),
            ];

            await util.expectBalanceChanges(
                web3,
                [creator, buyer1, buyer2],
                expectedReturns,
                () => {
                    return util.methodWithGas(
                        PresalePool.methods.withdrawAllForMany([creator, buyer1, buyer2]),
                        payoutAddress
                    )
                }
            );
        });

        it("withdrawAll sends the correct amount", async () => {
            let originalContribution = parseInt(util.toWei(web3, 2, "ether"));
            let gasCosts = util.distributionGasCosts({
                numContributors: 1, numDrops: 2
            });
            let recipients = [creator, buyer1, buyer2];
            let expectedReturns = [
                parseInt(util.toWei(web3, 2, "ether")) - gasCosts,
                parseInt(util.toWei(web3, 5, "ether")) - gasCosts,
                parseInt(util.toWei(web3, 1, "ether")),
            ];

            for(let i = 0; i < expectedReturns.length; i++) {
                let address = recipients[i];
                await util.expectBalanceChange(web3, address, expectedReturns[i], () => {
                    return util.methodWithGas(
                        PresalePool.methods.withdrawAll(),
                        address
                    )
                });
            }
        });
    });

});

