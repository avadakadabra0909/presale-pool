const chai = require('chai');

const server = require('./server');
const util = require('./util');

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
        tokenHolder = result.addresses[4];
        let feeTeamMember = result.addresses[result.addresses.length-1].toLowerCase();
        PBFeeManager = await util.deployContract(
            web3,
            "PBFeeManager",
            creator,
            [
                [feeTeamMember],
                web3.utils.toWei(0.005, "ether"),
                web3.utils.toWei(0.01, "ether")
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
                maxContribution: web3.utils.toWei(50, "ether"),
                maxPoolBalance: web3.utils.toWei(50, "ether")
            }),
            0,
            { 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
        );
        TestToken = await util.deployContract(
            web3,
            "TestToken",
            creator,
            [blacklistedBuyer]
        );
    });

    async function transferMoreTokensToPool(TokenContract, amount) {
        await web3.eth.sendTransaction({
            from: tokenHolder,
            to: TokenContract.options.address,
            value: web3.utils.toWei(.1, "ether")
        });

        await util.methodWithGas(
            TokenContract.methods.transfer(
                PresalePool.options.address,
                amount
            ),
            tokenHolder
        );
    }

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
            web3.utils.toWei(2, "ether")
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
            web3.utils.toWei(2, "ether")
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
            web3.utils.toWei(2, "ether")
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
            web3.utils.toWei(2, "ether")
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
            web3.utils.toWei(2, "ether")
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
        await transferMoreTokensToPool(TestToken, 18);
        await util.methodWithGas(
            PresalePool.methods.confirmTokens(TestToken.options.address, false),
            creator
        );

    });

    it("confirmTokens() cant be called multiple times", async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            web3.utils.toWei(2, "ether")
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
        await transferMoreTokensToPool(OtherTestToken, 18);
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
            web3.utils.toWei(2, "ether")
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
                web3.utils.toWei(2, "ether")
            );
            await util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer1,
                web3.utils.toWei(5, "ether")
            );
            await util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer2,
                web3.utils.toWei(1, "ether")
            );

            await util.methodWithGas(
                PresalePool.methods.setContributionSettings(
                    0, web3.utils.toWei(2, "ether"), web3.utils.toWei(3, "ether"), []
                ),
                creator
            );
            await util.methodWithGas(
                PresalePool.methods.payToPresale(
                    TestToken.options.address,
                    0, 0, '0x'
                ),
                creator
            );

            let expectedBalances = {}
            expectedBalances[creator] = {
                remaining: web3.utils.toWei(0, "ether"),
                contribution: web3.utils.toWei(2, "ether")
            }
            expectedBalances[buyer1] = {
                remaining: web3.utils.toWei(4, "ether"),
                contribution: web3.utils.toWei(1, "ether")
            }
            expectedBalances[buyer2] = {
                remaining: web3.utils.toWei(1, "ether"),
                contribution: web3.utils.toWei(0, "ether")
            }
            await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei(5 + poolFee*3, "ether"));

            expect(await TestToken.methods.totalTokens().call())
            .to.equal("940");

            await util.methodWithGas(
                PresalePool.methods.confirmTokens(TestToken.options.address, true),
                creator
            );
        }

        async function tokenBalanceEquals(address, amount) {
            expect(
                parseInt(
                    await TestToken.methods.balanceOf(address).call()
                )
            ).to.equal(amount);
        }

        it("transferTokensToAll()", async () => {
            await setUpPaidPoolWithTokens();

            // calling multiple consecutive times doesn't give you more tokens
            await util.expectBalanceChanges(
                web3,
                [creator, buyer1, buyer2],
                [0, 4, 1].map(x => web3.utils.toWei(x, "ether")),
                () => {
                        return util.methodWithGas(
                            PresalePool.methods.transferTokensToAll(
                                TestToken.options.address
                            ),
                            creator
                        );
                }
            );
            await util.expectBalanceChangeAddresses(web3, [creator, buyer1, buyer2], web3.utils.toWei(0, "ether"), () => {
                return util.methodWithGas(
                    PresalePool.methods.transferTokensToAll(TestToken.options.address),
                    creator
                );
            });

            await tokenBalanceEquals(creator, 40);
            await tokenBalanceEquals(buyer1, 20);
            await tokenBalanceEquals(buyer2, 0);

            await transferMoreTokensToPool(TestToken, 18);

            await util.expectBalanceChangeAddresses(web3, [creator, buyer1, buyer2], web3.utils.toWei(0, "ether"), () => {
                return util.methodWithGas(
                    PresalePool.methods.transferTokensToAll(TestToken.options.address),
                    creator
                );
            });

            await tokenBalanceEquals(creator, 52);
            await tokenBalanceEquals(buyer1, 26);
            await tokenBalanceEquals(buyer2, 0);

            let expectedBalances = {};
            expectedBalances[creator] = {
                remaining: web3.utils.toWei(0, "ether"),
                contribution: web3.utils.toWei(2, "ether")
            }
            expectedBalances[buyer1] = {
                remaining: web3.utils.toWei(0, "ether"),
                contribution: web3.utils.toWei(1, "ether")
            }
            expectedBalances[buyer2] = {
                remaining: web3.utils.toWei(0, "ether"),
                contribution: web3.utils.toWei(0, "ether")
            }
            await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei(0, "ether"));
        });

        it("transferTokensTo()", async () => {
            await setUpPaidPoolWithTokens();

            // calling multiple consecutive times doesn't give you more tokens
            await util.expectBalanceChanges(
                web3,
                [creator, buyer1, buyer2],
                [0, 4, 1].map(x => web3.utils.toWei(x, "ether")),
                () => {
                    return util.methodWithGas(
                        PresalePool.methods.transferTokensTo(
                            TestToken.options.address,
                            [creator, buyer1, buyer2]
                        ),
                        creator
                    );
                }
            );
            await util.expectBalanceChangeAddresses(web3, [creator, buyer1, buyer2], web3.utils.toWei(0, "ether"), () => {
                return util.methodWithGas(
                    PresalePool.methods.transferTokensTo(
                        TestToken.options.address,
                        [creator, buyer1, buyer2]
                    ),
                    creator
                );
            });

            await tokenBalanceEquals(creator, 40);
            await tokenBalanceEquals(buyer1, 20);
            await tokenBalanceEquals(buyer2, 0);

            await transferMoreTokensToPool(TestToken, 18);

            await util.expectBalanceChangeAddresses(web3, [creator, buyer1, buyer2], web3.utils.toWei(0, "ether"), () => {
                return util.methodWithGas(
                    PresalePool.methods.transferTokensTo(
                        TestToken.options.address,
                        [creator]
                    ),
                    creator
                );
            });

            await tokenBalanceEquals(creator, 52);
            await tokenBalanceEquals(buyer1, 20);
            await tokenBalanceEquals(buyer2, 0);

            let expectedBalances = {};
            expectedBalances[creator] = {
                remaining: web3.utils.toWei(0, "ether"),
                contribution: web3.utils.toWei(2, "ether")
            }
            expectedBalances[buyer1] = {
                remaining: web3.utils.toWei(0, "ether"),
                contribution: web3.utils.toWei(1, "ether")
            }
            expectedBalances[buyer2] = {
                remaining: web3.utils.toWei(0, "ether"),
                contribution: web3.utils.toWei(0, "ether")
            }
            await util.verifyState(
                web3,
                PresalePool,
                expectedBalances,
                web3.utils.toWei(0, "ether")
            );
        });

        it("skips blacklisted sender", async () => {
            await util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer1,
                web3.utils.toWei(5, "ether")
            );
            await util.methodWithGas(
                PresalePool.methods.deposit(),
                blacklistedBuyer,
                web3.utils.toWei(5, "ether")
            );

            await util.methodWithGas(
                PresalePool.methods.payToPresale(
                    TestToken.options.address,
                    0, 0, '0x'
                ),
                creator
            );

            let expectedBalances = {}
            expectedBalances[buyer1] = {
                remaining: web3.utils.toWei(0, "ether"),
                contribution: web3.utils.toWei(5, "ether")
            }
            expectedBalances[blacklistedBuyer] = {
                remaining: web3.utils.toWei(0, "ether"),
                contribution: web3.utils.toWei(5, "ether")
            }
            await util.verifyState(
                web3,
                PresalePool,
                expectedBalances,
                web3.utils.toWei(10*poolFee, "ether")
            );

            expect(await TestToken.methods.totalTokens().call())
            .to.equal("940");

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

            await tokenBalanceEquals(PresalePool.options.address, 30);
            await tokenBalanceEquals(buyer1, 30);
            await tokenBalanceEquals(buyer2, 0);
            await tokenBalanceEquals(blacklistedBuyer, 0);
            await tokenBalanceEquals(creator, 0);

            await util.methodWithGas(
                PresalePool.methods.transferTokensToAll(
                    TestToken.options.address
                ),
                creator
            );

            await tokenBalanceEquals(PresalePool.options.address, 30);
            await tokenBalanceEquals(buyer1, 30);
            await tokenBalanceEquals(buyer2, 0);
            await tokenBalanceEquals(blacklistedBuyer, 0);
            await tokenBalanceEquals(creator, 0);
        });
    });
});

