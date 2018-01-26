const chai = require('chai');

const server = require('./server');
const util = require('./util');
const BigNumber = util.BigNumber;

const expect = chai.expect;

describe('confirmTokens', () => {
    let creator;
    let buyer1;
    let buyer2;
    let blacklistedBuyer;
    let tokenHolder;
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
        blacklistedBuyer = result.addresses[3].toLowerCase();
        tokenHolder = result.addresses[4].toLowerCase();
        let feeTeamMember = result.addresses[result.addresses.length-1].toLowerCase();
        PBFeeManager = await util.deployContract(
            web3,
            "PBFeeManager",
            creator,
            [
                [feeTeamMember],
                util.toWei(web3, poolFee, "ether"),
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
    let TestToken;
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
        TestToken = await util.deployContract(
            web3,
            "TestToken",
            tokenHolder,
            [blacklistedBuyer]
        );
    });

    it("tokenFallback() cant be called in failed state", async () => {
        await util.methodWithGas(PresalePool.methods.fail(), creator);
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.tokenFallback(creator, 1, '0x'),
                creator
            )
        );
    });

    it("tokenFallback() cant be called in refunded state", async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            util.toWei(web3, 2, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.payToPresale(creator, 0, 0, '0x'),
            creator
        );
        await util.methodWithGas(
            PresalePool.methods.expectRefund(creator),
            creator
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.tokenFallback(creator, 1, '0x'),
                creator
            )
        );
    });

    it("tokenFallback() cant be called in open state", async () => {
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.tokenFallback(creator, 1, '0x'),
                creator
            )
        );
    });

    it("tokenFallback() can be called in paid state", async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            util.toWei(web3, 2, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.payToPresale(creator, 0, 0, '0x'),
            creator
        );

        await util.methodWithGas(
            PresalePool.methods.tokenFallback(creator, 1, '0x'),
            creator
        );
    });

    it("confirmTokens() cant be called in failed state", async () => {
        await util.methodWithGas(PresalePool.methods.fail(), creator);
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.confirmTokens(TestToken.options.address, false),
                creator
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.confirmTokens(TestToken.options.address, true),
                creator
            )
        );
    });

    it("confirmTokens() cant be called in refunded state", async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            util.toWei(web3, 2, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.payToPresale(creator, 0, 0, '0x'),
            creator
        );
        await util.methodWithGas(
            PresalePool.methods.expectRefund(creator),
            creator
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.confirmTokens(TestToken.options.address, false),
                creator
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.confirmTokens(TestToken.options.address, true),
                creator
            )
        );
    });

    it("confirmTokens() cant be called in open state", async () => {
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.confirmTokens(TestToken.options.address, false),
                creator
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.confirmTokens(TestToken.options.address, true),
                creator
            )
        );
    });

    it("confirmTokens() can only be called by creator", async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            util.toWei(web3, 2, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.payToPresale(TestToken.options.address, 0, 0, '0x'),
            creator
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.confirmTokens(TestToken.options.address, false),
                buyer1
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.confirmTokens(TestToken.options.address, true),
                buyer1
            )
        );
        await util.methodWithGas(
            PresalePool.methods.confirmTokens(TestToken.options.address, true),
            creator
        );
    });

    it("confirmTokens() cant be called when there are no tokens deposited to the contract", async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            util.toWei(web3, 2, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.payToPresale(creator, 0, 0, '0x'),
            creator
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.confirmTokens(TestToken.options.address, false),
                creator
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.confirmTokens(TestToken.options.address, true),
                creator
            )
        );
        // Transfer more tokens
        let NumTokensNotFormatted = new BigNumber("1000").mul(new BigNumber("10").pow(new BigNumber("18")));
        await util.methodWithGas(
            TestToken.methods.transfer(
                PresalePool.options.address,
                NumTokensNotFormatted.toString(10)
            ),
            tokenHolder
        );
        await util.methodWithGas(
            PresalePool.methods.confirmTokens(TestToken.options.address, false),
            creator
        );

    });

    it("confirmTokens() cant be called multiple times", async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            util.toWei(web3, 2, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.payToPresale(TestToken.options.address, 0, 0, '0x'),
            creator
        );

        await util.methodWithGas(
            PresalePool.methods.confirmTokens(TestToken.options.address, false),
            creator
        );
        let OtherTestToken = await util.deployContract(
            web3,
            "TestToken",
            creator,
            [blacklistedBuyer]
        );
        // Transfer more tokens
        let NumTokensNotFormatted = new BigNumber("1000").mul(new BigNumber("10").pow(new BigNumber("18")));
        await util.methodWithGas(
            TestToken.methods.transfer(
                PresalePool.options.address,
                NumTokensNotFormatted.toString(10)
            ),
            tokenHolder
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.confirmTokens(OtherTestToken.options.address, false),
                creator
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.confirmTokens(OtherTestToken.options.address, true),
                creator
            )
        );
    });

    it("tokens cant be claimed in open state", async () => {
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.transferTokensToAll(
                    TestToken.options.address
                ),
                creator
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.transferTokensTo(
                    TestToken.options.address, [creator]
                ),
                creator
            )
        );
    });

    it("tokens cant be claimed in failed state", async () => {
        await util.methodWithGas(PresalePool.methods.fail(), creator);
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.transferTokensToAll(
                    TestToken.options.address
                ),
                creator
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.transferTokensTo(
                    TestToken.options.address,
                    [creator]
                ),
                creator
            )
        );
    });

    it("tokens cant be claimed in refunded state", async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            util.toWei(web3, 2, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.payToPresale(creator, 0, 0, '0x'),
            creator
        );
        await util.methodWithGas(
            PresalePool.methods.expectRefund(creator),
            creator
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.transferTokensToAll(
                    TestToken.options.address
                ),
                creator
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.transferTokensTo(
                    TestToken.options.address,
                    [creator]
                ),
                creator
            )
        );
    });

    describe("claim tokens", async () => {
        async function setUpPaidPoolWithTokens() {
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

            await util.methodWithGas(
                PresalePool.methods.setContributionSettings(
                    0, util.toWei(web3, 2, "ether"), util.toWei(web3, 3, "ether"), []
                ),
                creator
            );
            await util.methodWithGas(
                PresalePool.methods.payToPresale(
                    tokenHolder,
                    0, 0, '0x'
                ),
                creator
            );

            let expectedBalances = {};
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
            await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 5 + poolFee*3, "ether"));

            // Send tokens
            let NumTokensNotFormatted = new BigNumber("1000").mul(new BigNumber("10").pow(new BigNumber("18")));
            await util.methodWithGas(
                TestToken.methods.transfer(
                    PresalePool.options.address,
                    NumTokensNotFormatted.toString(10)
                ),
                tokenHolder
            );

            await util.tokenBalanceEquals(TestToken, PresalePool.options.address, NumTokensNotFormatted);

            await util.methodWithGas(
                PresalePool.methods.confirmTokens(TestToken.options.address, true),
                creator
            );
        }

        it("transferTokensToAll()", async () => {
            await setUpPaidPoolWithTokens();

            // calling multiple consecutive times doesn't give you more tokens
            await util.expectBalanceChanges(
                web3,
                [creator, buyer1, buyer2],
                [0, 4, 1].map(x => util.toWei(web3, x, "ether")),
                () => {
                        return util.methodWithGas(
                            PresalePool.methods.transferTokensToAll(
                                TestToken.options.address
                            ),
                        creator
                        );
                }
            );
            await util.expectBalanceChangeAddresses(web3, [creator, buyer1, buyer2], util.toWei(web3, 0, "ether"), () => {
                return util.methodWithGas(
                    PresalePool.methods.transferTokensToAll(TestToken.options.address),
                    creator
                );
            });

            let NumTestTokenNotFormatted = new BigNumber("1000").mul(new BigNumber("10").pow(new BigNumber("18")));
            const poolBalanceInWei = new BigNumber(util.toWei(web3, 3, 'ether'));
            const zero = new BigNumber(0);

            await util.tokenBalanceEquals(
                TestToken,
                creator,
                util.getTokenShare(
                    new BigNumber(util.toWei(web3, 2, 'ether')),
                    poolBalanceInWei,
                    poolFee,
                    zero,
                    2,
                    NumTestTokenNotFormatted
                )
            );
            await util.tokenBalanceEquals(
                TestToken,
                buyer1,
                util.getTokenShare(
                    new BigNumber(util.toWei(web3, 1, 'ether')),
                    poolBalanceInWei,
                    poolFee,
                    zero,
                    2,
                    NumTestTokenNotFormatted
                )
            );
            await util.tokenBalanceEquals(
                TestToken,
                buyer2,
                util.getTokenShare(
                    new BigNumber(util.toWei(web3, 0, 'ether')),
                    poolBalanceInWei,
                    poolFee,
                    zero,
                    2,
                    NumTestTokenNotFormatted
                )
            );


            // send 10 more tokens
            let additionalTokensBN = new BigNumber("10").mul(new BigNumber("10").pow(new BigNumber("18")));
            await util.methodWithGas(
                TestToken.methods.transfer(
                    PresalePool.options.address,
                    additionalTokensBN.toString(10)
                ),
                tokenHolder
            );

            await util.expectBalanceChangeAddresses(web3, [creator, buyer1, buyer2], util.toWei(web3, 0, "ether"), () => {
                return util.methodWithGas(
                    PresalePool.methods.transferTokensToAll(TestToken.options.address),
                    creator
                );
            });

            let totalTokensSent = NumTestTokenNotFormatted.add(additionalTokensBN);
            await util.tokenBalanceEquals(TestToken, creator,
                util.getTokenShare(
                    new BigNumber(util.toWei(web3, 2, 'ether')),
                    poolBalanceInWei,
                    poolFee,
                    zero,
                    2,
                    totalTokensSent
                )
            );
            await util.tokenBalanceEquals(
                TestToken,
                buyer1,
                util.getTokenShare(
                    new BigNumber(util.toWei(web3, 1, 'ether')),
                    poolBalanceInWei,
                    poolFee,
                    zero,
                    2,
                    totalTokensSent
                )
            );
            await util.tokenBalanceEquals(
                TestToken,
                buyer2,
                util.getTokenShare(
                    new BigNumber(util.toWei(web3, 0, 'ether')),
                    poolBalanceInWei,
                    poolFee,
                    zero,
                    2,
                    totalTokensSent
                )
            );

            let expectedBalances = {};
            expectedBalances[creator] = {
                remaining: util.toWei(web3, 0, "ether"),
                contribution: util.toWei(web3, 2, "ether")
            };
            expectedBalances[buyer1] = {
                remaining: util.toWei(web3, 0, "ether"),
                contribution: util.toWei(web3, 1, "ether")
            };
            expectedBalances[buyer2] = {
                remaining: util.toWei(web3, 0, "ether"),
                contribution: util.toWei(web3, 0, "ether")
            };
            await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 0, "ether"));
        });

        it("transferTokensTo()", async () => {
            await setUpPaidPoolWithTokens();

            // calling multiple consecutive times doesn't give you more tokens
            await util.expectBalanceChanges(
                web3,
                [creator, buyer1, buyer2],
                [0, 4, 1].map(x => util.toWei(web3, x, "ether")),
                () => {
                    return util.methodWithGas(
                        PresalePool.methods.transferTokensTo(
                            TestToken.options.address,
                            [creator, buyer1, buyer2]
                        ),
                        tokenHolder
                    );
                }
            );
            await util.expectBalanceChangeAddresses(web3, [creator, buyer1, buyer2], util.toWei(web3, 0, "ether"), () => {
                return util.methodWithGas(
                    PresalePool.methods.transferTokensTo(
                        TestToken.options.address,
                        [creator, buyer1, buyer2]
                    ),
                    tokenHolder
                );
            });

            let NumTestTokenNotFormatted = new BigNumber("1000").mul(new BigNumber("10").pow(new BigNumber("18")));
            const poolBalanceInWei = new BigNumber(util.toWei(web3, 3, 'ether'));
            const zero = new BigNumber(0);

            await util.tokenBalanceEquals(
                TestToken,
                creator,
                util.getTokenShare(
                    new BigNumber(util.toWei(web3, 2, 'ether')),
                    poolBalanceInWei,
                    poolFee,
                    zero,
                    2,
                    NumTestTokenNotFormatted
                )
            );
            await util.tokenBalanceEquals(
                TestToken,
                buyer1,
                util.getTokenShare(
                    new BigNumber(util.toWei(web3, 1, 'ether')),
                    poolBalanceInWei,
                    poolFee,
                    zero,
                    2,
                    NumTestTokenNotFormatted
                )
            );
            await util.tokenBalanceEquals(
                TestToken,
                buyer2,
                util.getTokenShare(
                    new BigNumber(util.toWei(web3, 0, 'ether')),
                    poolBalanceInWei,
                    poolFee,
                    zero,
                    2,
                    NumTestTokenNotFormatted
                )
            );

            // send 10 more tokens
            let additionalTokensBN = new BigNumber("10").mul(new BigNumber("10").pow(new BigNumber("18")));
            await util.methodWithGas(
                TestToken.methods.transfer(
                    PresalePool.options.address,
                    additionalTokensBN.toString(10)
                ),
                tokenHolder
            );

            // Send only to creator
            await util.expectBalanceChangeAddresses(web3, [creator, buyer1, buyer2], util.toWei(web3, 0, "ether"), () => {
                return util.methodWithGas(
                    PresalePool.methods.transferTokensTo(
                        TestToken.options.address,
                        [creator]
                    ),
                    creator
                );
            });

            let totalTokensSent = NumTestTokenNotFormatted.add(additionalTokensBN);
            await util.tokenBalanceEquals(TestToken, creator,
                util.getTokenShare(
                    new BigNumber(util.toWei(web3, 2, 'ether')),
                    poolBalanceInWei,
                    poolFee,
                    zero,
                    2,
                    totalTokensSent
                )
            );
            await util.tokenBalanceEquals(
                TestToken,
                buyer1,
                util.getTokenShare(
                    new BigNumber(util.toWei(web3, 1, 'ether')),
                    poolBalanceInWei,
                    poolFee,
                    zero,
                    2,
                    NumTestTokenNotFormatted
                )
            );
            await util.tokenBalanceEquals(
                TestToken,
                buyer2,
                util.getTokenShare(
                    new BigNumber(util.toWei(web3, 0, 'ether')),
                    poolBalanceInWei,
                    poolFee,
                    zero,
                    2,
                    NumTestTokenNotFormatted
                )
            );


            let expectedBalances = {};
            expectedBalances[creator] = {
                remaining: util.toWei(web3, 0, "ether"),
                contribution: util.toWei(web3, 2, "ether")
            };
            expectedBalances[buyer1] = {
                remaining: util.toWei(web3, 0, "ether"),
                contribution: util.toWei(web3, 1, "ether")
            };
            expectedBalances[buyer2] = {
                remaining: util.toWei(web3, 0, "ether"),
                contribution: util.toWei(web3, 0, "ether")
            };
            await util.verifyState(
                web3,
                PresalePool,
                expectedBalances,
                util.toWei(web3, 0, "ether")
            );
        });

        it("skips blacklisted sender", async () => {
            await util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer1,
                util.toWei(web3, 5, "ether")
            );
            await util.methodWithGas(
                PresalePool.methods.deposit(),
                blacklistedBuyer,
                util.toWei(web3, 5, "ether")
            );

            await util.methodWithGas(
                PresalePool.methods.payToPresale(
                    TestToken.options.address,
                    0, 0, '0x'
                ),
                creator
            );

            let expectedBalances = {};
            expectedBalances[buyer1] = {
                remaining: util.toWei(web3, 0, "ether"),
                contribution: util.toWei(web3, 5, "ether")
            };
            expectedBalances[blacklistedBuyer] = {
                remaining: util.toWei(web3, 0, "ether"),
                contribution: util.toWei(web3, 5, "ether")
            };
            await util.verifyState(
                web3,
                PresalePool,
                expectedBalances,
                util.toWei(web3, 10*poolFee, "ether")
            );

            await util.methodWithGas(
                PresalePool.methods.confirmTokens(TestToken.options.address, true),
                creator
            );

            await util.methodWithGas(
                PresalePool.methods.transferTokensTo(
                    TestToken.options.address,
                    [
                        blacklistedBuyer,
                        blacklistedBuyer,
                        buyer1,
                        buyer2,
                        buyer1,
                        creator
                    ]
                ),
                creator
            );

            let NumTestTokenNotFormatted = new BigNumber("1000").mul(new BigNumber("10").pow(new BigNumber("18")));
            const poolBalanceInWei = new BigNumber(util.toWei(web3, 10, 'ether'));
            const zero = new BigNumber(0);

            await util.tokenBalanceEquals(
                TestToken,
                creator,
                util.getTokenShare(
                    new BigNumber(util.toWei(web3, 0, 'ether')),
                    poolBalanceInWei,
                    poolFee,
                    zero,
                    2,
                    NumTestTokenNotFormatted
                )
            );
            await util.tokenBalanceEquals(
                TestToken,
                buyer1,
                util.getTokenShare(
                    new BigNumber(util.toWei(web3, 5, 'ether')),
                    poolBalanceInWei,
                    poolFee,
                    zero,
                    2,
                    NumTestTokenNotFormatted
                )
            );
            await util.tokenBalanceEquals(
                TestToken,
                buyer2,
                util.getTokenShare(
                    new BigNumber(util.toWei(web3, 0, 'ether')),
                    poolBalanceInWei,
                    poolFee,
                    zero,
                    2,
                    NumTestTokenNotFormatted)
                );
            await util.tokenBalanceEquals(
                TestToken,
                blacklistedBuyer,
                util.getTokenShare(
                    new BigNumber(util.toWei(web3, 0, 'ether')),
                    poolBalanceInWei,
                    poolFee,
                    zero,
                    2,
                    NumTestTokenNotFormatted
                )
            );
            await util.tokenBalanceEquals(
                TestToken,
                PresalePool.options.address,
                util.getTokenShare(
                    new BigNumber(util.toWei(web3, 5, 'ether')),
                    poolBalanceInWei,
                    poolFee,
                    zero,
                    2,
                    NumTestTokenNotFormatted
                )
            );

            await util.methodWithGas(
                PresalePool.methods.transferTokensToAll(
                    TestToken.options.address
                ),
                creator
            );

            await util.tokenBalanceEquals(
                TestToken,
                creator,
                util.getTokenShare(
                    new BigNumber(util.toWei(web3, 0, 'ether')),
                    poolBalanceInWei,
                    poolFee,
                    zero,
                    2,
                    NumTestTokenNotFormatted
                )
            );
            await util.tokenBalanceEquals(
                TestToken,
                buyer1,
                util.getTokenShare(
                    new BigNumber(util.toWei(web3, 5, 'ether')),
                    poolBalanceInWei,
                    poolFee,
                    zero,
                    2,
                    NumTestTokenNotFormatted
                )
            );
            await util.tokenBalanceEquals(
                TestToken,
                buyer2,
                util.getTokenShare(
                    new BigNumber(util.toWei(web3, 0, 'ether')),
                    poolBalanceInWei,
                    poolFee,
                    zero,
                    2,
                    NumTestTokenNotFormatted
                )
            );
            await util.tokenBalanceEquals(
                TestToken,
                blacklistedBuyer,
                util.getTokenShare(
                    new BigNumber(util.toWei(web3, 0, 'ether')),
                    poolBalanceInWei,
                    poolFee,
                    zero,
                    2,
                    NumTestTokenNotFormatted
                )
            );
            await util.tokenBalanceEquals(
                TestToken,
                PresalePool.options.address,
                util.getTokenShare(
                    new BigNumber(util.toWei(web3, 5, 'ether')),
                    poolBalanceInWei,
                    poolFee,
                    zero,
                    2,
                    NumTestTokenNotFormatted
                )
            );
        });
    });
});

