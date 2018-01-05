const chai = require('chai');

const server = require('./server');
const util = require('./util');

const expect = chai.expect;

describe('Air Drop', () => {
    let creator;
    let addresses;
    let buyer1;
    let buyer2;
    let buyer3;
    let gasFeeRecipient;
    let web3;
    let PBFeeManager;
    let TestToken;
    let feeTeamMember;
    let PresalePoolLib;

    before(async () => {
        let result = await server.setUp();
        web3 = result.web3;
        creator = result.addresses[0].toLowerCase();
        addresses = result.addresses;
        buyer1 = addresses[1].toLowerCase();
        buyer2 = addresses[2].toLowerCase();
        buyer3 = addresses[3].toLowerCase();
        buyer4 = addresses[4].toLowerCase();
        buyer5 = addresses[5].toLowerCase();
        buyer6 = addresses[6].toLowerCase();
        gasFeeRecipient = addresses[7].toLowerCase();
        feeTeamMember = addresses[8].toLowerCase();
        PresalePoolLib = await util.deployContract(
            web3,
            "PoolLib",
            creator,
            []
        );

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
    });

    let PresalePool;
    beforeEach(async () => {
        PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                minContribution: web3.utils.toWei(1, "ether"),
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
            [feeTeamMember]
        );

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            web3.utils.toWei(5, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer2,
            web3.utils.toWei(3, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer3,
            web3.utils.toWei(6, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer4,
            web3.utils.toWei(7, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer5,
            web3.utils.toWei(8, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer6,
            web3.utils.toWei(9, "ether")
        );

        let expectedBalances = {}
        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei(0, "ether"),
            contribution: web3.utils.toWei(5, "ether"),
        }
        expectedBalances[buyer2] = {
            remaining: web3.utils.toWei(0, "ether"),
            contribution: web3.utils.toWei(3, "ether"),
        }
        expectedBalances[buyer3] = {
            remaining: web3.utils.toWei(0, "ether"),
            contribution: web3.utils.toWei(6, "ether"),
        }
        expectedBalances[buyer4] = {
            remaining: web3.utils.toWei(0, "ether"),
            contribution: web3.utils.toWei(7, "ether"),
        }
        expectedBalances[buyer5] = {
            remaining: web3.utils.toWei(0, "ether"),
            contribution: web3.utils.toWei(8, "ether"),
        }
        expectedBalances[buyer6] = {
            remaining: web3.utils.toWei(0, "ether"),
            contribution: web3.utils.toWei(9, "ether"),
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei(38, "ether"));

        await util.methodWithGas(
            PresalePool.methods.modifyWhitelist([], [buyer2, buyer4]),
            creator
        );
        expectedBalances[buyer2].whitelisted = false
        expectedBalances[buyer2].contribution = web3.utils.toWei(0, "ether")
        expectedBalances[buyer2].remaining = web3.utils.toWei(3, "ether")
        expectedBalances[buyer4].whitelisted = false
        expectedBalances[buyer4].contribution = web3.utils.toWei(0, "ether")
        expectedBalances[buyer4].remaining = web3.utils.toWei(7, "ether")
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei(38, "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                web3.utils.toWei(5, "ether"),
                web3.utils.toWei(50, "ether"),
                web3.utils.toWei(50, "ether"),
                []
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei(38, "ether"));

        await util.methodWithGas(
            PresalePool.methods.modifyWhitelist([buyer2], []),
            creator
        );
        expectedBalances[buyer2].whitelisted = true;
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei(38, "ether"));

        expectedBalances[buyer5].contribution = '0'
        expectedBalances[buyer6].contribution = '0'
        await util.methodWithGas(
            PresalePool.methods.withdrawAll(),
            buyer5
        );
        await util.methodWithGas(
            PresalePool.methods.withdraw(web3.utils.toWei(9, "ether")),
            buyer6
        );
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei(21, "ether"));
    });


    after(async () => {
        await server.tearDown();
    });

    it('cant be called in open state', async () => {
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.airdropEther(
                    1,
                    gasFeeRecipient
                ),
                creator,
                web3.utils.toWei(11, "ether")
            )
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.airdropTokens(
                    TestToken.options.address,
                    1,
                    gasFeeRecipient
                ),
                creator
            )
        );
    });

    it('cant be called in failed state', async () => {
        await util.methodWithGas(
            PresalePool.methods.fail(),
            creator
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.airdropEther(
                    1,
                    gasFeeRecipient
                ),
                creator,
                web3.utils.toWei(11, "ether")
            )
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.airdropTokens(
                    TestToken.options.address,
                    1,
                    gasFeeRecipient
                ),
                creator
            )
        );
    });

    it('cant be called in paid state if tokens are not confirmed', async () => {
        await util.methodWithGas(
            PresalePool.methods.payToPresale(
                TestToken.options.address,
                0, 0, '0x'
            ),
            creator
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.airdropEther(
                    1,
                    gasFeeRecipient
                ),
                creator,
                web3.utils.toWei(11, "ether")
            )
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.airdropTokens(
                    TestToken.options.address,
                    1,
                    gasFeeRecipient
                ),
                creator
            )
        );
    });

    it('cant be called in refund state', async () => {
        await util.methodWithGas(
            PresalePool.methods.payToPresale(
                creator,
                0, 0, '0x'
            ),
            creator
        );

        await util.methodWithGas(
            PresalePool.methods.expectRefund(creator),
            creator
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.airdropEther(
                    1,
                    gasFeeRecipient
                ),
                creator,
                web3.utils.toWei(11, "ether")
            )
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.airdropTokens(
                    TestToken.options.address,
                    1,
                    gasFeeRecipient
                ),
                creator
            )
        );
    });

    it('ether with auto distribution', async () => {
        await util.methodWithGas(
            PresalePool.methods.payToPresale(
                TestToken.options.address,
                0, 0, '0x'
            ),
            creator
        );

        await util.methodWithGas(
            PresalePool.methods.confirmTokens(TestToken.options.address, true),
            creator
        );

        let gasCosts = util.distributionGasCosts({
            numContributors: 2, numDrops: 1, gasPriceGwei: 5
        });
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.airdropEther(
                    web3.utils.toWei(5, "gwei"),
                    gasFeeRecipient
                ),
                buyer6,
                gasCosts
            )
        );

        await util.expectBalanceChange(web3, gasFeeRecipient, gasCosts, () => {
            return util.methodWithGas(
                PresalePool.methods.airdropEther(
                    web3.utils.toWei(5, "gwei"),
                    gasFeeRecipient
                ),
                buyer6,
                gasCosts + parseInt(web3.utils.toWei(11, "ether"))
            )
        });

        await util.expectBalanceChanges(
            web3,
            [buyer1, buyer2, buyer3, buyer4, buyer5, buyer6],
            [0, 3, 0, 7, 0, 0].map(x => web3.utils.toWei(x, "ether")),
            () => {
                return util.methodWithGas(
                    PresalePool.methods.transferAllTokens(
                        TestToken.options.address
                    ),
                    creator
                );
            }
        );

        await util.expectBalanceChanges(
            web3,
            [buyer1, buyer2, buyer3, buyer4, buyer5, buyer6],
            [5, 0, 6, 0, 0, 0].map(x => web3.utils.toWei(x, "ether")),
            () => {
                return util.methodWithGas(
                    PresalePool.methods.withdrawAllForMany([
                        buyer1,
                        buyer2,
                        buyer3,
                        buyer4,
                        buyer5,
                        buyer6,
                        creator,
                        feeTeamMember
                    ]),
                    feeTeamMember
                );
            }
        );
    });

    it('ether without auto distribution', async () => {
        await util.methodWithGas(
            PresalePool.methods.payToPresale(
                TestToken.options.address,
                0, 0, '0x'
            ),
            creator
        );

        await util.methodWithGas(
            PresalePool.methods.confirmTokens(TestToken.options.address, true),
            creator
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.airdropEther(
                    0,
                    gasFeeRecipient
                ),
                creator,
                0
            )
        );

        await util.expectBalanceChange(web3, gasFeeRecipient, 0, () => {
            return util.methodWithGas(
                PresalePool.methods.airdropEther(
                    web3.utils.toWei(5, "gwei"),
                    gasFeeRecipient
                ),
                creator,
                web3.utils.toWei(11, "ether")
            )
        });

        await util.expectBalanceChanges(
            web3,
            [buyer1, buyer2, buyer3, buyer4, buyer5, buyer6],
            [0, 3, 0, 7, 0, 0].map(x => web3.utils.toWei(x, "ether")),
            () => {
                return util.methodWithGas(
                    PresalePool.methods.transferAllTokens(
                        TestToken.options.address
                    ),
                    creator
                );
            }
        );

        await util.expectBalanceChanges(
            web3,
            [buyer1, buyer2, buyer3, buyer4, buyer5, buyer6],
            [5, 0, 6, 0, 0, 0].map(x => web3.utils.toWei(x, "ether")),
            () => {
                return util.methodWithGas(
                    PresalePool.methods.withdrawAllForMany([
                        buyer1,
                        buyer2,
                        buyer3,
                        buyer4,
                        buyer5,
                        buyer6,
                        creator,
                        feeTeamMember
                    ]),
                    feeTeamMember
                );
            }
        );
    });

    async function transferMoreTokensToPool(TokenContract, amount) {
        await web3.eth.sendTransaction({
            from: creator,
            to: TokenContract.options.address,
            value: web3.utils.toWei(.1, "ether")
        });

        await util.methodWithGas(
            TokenContract.methods.transfer(
                PresalePool.options.address,
                amount
            ),
            creator
        );
    }

    async function tokenBalanceEquals(TokenContract, address, amount) {
        expect(
            parseInt(
                await TokenContract.methods.balanceOf(address).call()
            )
        ).to.equal(amount);
    }


    it('tokens with auto distribution', async () => {
        await util.methodWithGas(
            PresalePool.methods.payToPresale(
                TestToken.options.address,
                0, 0, '0x'
            ),
            creator
        );

        await util.methodWithGas(
            PresalePool.methods.confirmTokens(TestToken.options.address, true),
            creator
        );

        let OtherTestToken = await util.deployContract(
            web3,
            "TestToken",
            creator,
            [feeTeamMember]
        );

        let gasCosts = util.distributionGasCosts({
            numContributors: 2, numDrops: 1, gasPriceGwei: 5
        });
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.airdropTokens(
                    OtherTestToken.options.address,
                    web3.utils.toWei(5, "gwei"),
                    gasFeeRecipient
                ),
                buyer6,
                gasCosts*0.99
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.airdropTokens(
                    OtherTestToken.options.address,
                    web3.utils.toWei(5, "gwei"),
                    gasFeeRecipient
                ),
                buyer6,
                Math.floor(gasCosts*2.01)
            )
        );

        await util.expectBalanceChange(web3, gasFeeRecipient, gasCosts, () => {
            return util.methodWithGas(
                PresalePool.methods.airdropTokens(
                    OtherTestToken.options.address,
                    web3.utils.toWei(5, "gwei"),
                    gasFeeRecipient
                ),
                buyer6,
                gasCosts
            )
        });

        await transferMoreTokensToPool(OtherTestToken, 11);

        await util.expectBalanceChanges(
            web3,
            [buyer1, buyer2, buyer3, buyer4, buyer5, buyer6],
            [0, 3, 0, 7, 0, 0].map(x => web3.utils.toWei(x, "ether")),
            () => {
                return util.methodWithGas(
                    PresalePool.methods.transferAllTokens(
                        TestToken.options.address
                    ),
                    creator
                );
            }
        );

        await tokenBalanceEquals(TestToken, buyer1, Math.floor(60*5/11));
        await tokenBalanceEquals(TestToken, buyer2, 0);
        await tokenBalanceEquals(TestToken, buyer3, Math.floor(60*6/11));
        await tokenBalanceEquals(TestToken, buyer4, 0);
        await tokenBalanceEquals(TestToken, buyer5, 0);
        await tokenBalanceEquals(TestToken, buyer6, 0);


        await util.expectBalanceChanges(
            web3,
            [buyer1, buyer2, buyer3, buyer4, buyer5, buyer6],
            [0, 0, 0, 0, 0, 0].map(x => web3.utils.toWei(x, "ether")),
            () => {
                return util.methodWithGas(
                    PresalePool.methods.withdrawAllForMany([
                        buyer1,
                        buyer2,
                        buyer3,
                        buyer4,
                        buyer5,
                        buyer6,
                        feeTeamMember
                    ]),
                    feeTeamMember
                );
            }
        );

        await util.methodWithGas(
            PresalePool.methods.transferTokensTo(
                OtherTestToken.options.address, [
                    buyer1,
                    buyer2,
                    buyer3,
                    buyer4,
                    buyer5,
                    buyer6,
                    feeTeamMember
            ]),
            feeTeamMember
        );

        await tokenBalanceEquals(OtherTestToken, buyer1, 5);
        await tokenBalanceEquals(OtherTestToken, buyer2, 0);
        await tokenBalanceEquals(OtherTestToken, buyer3, 6);
        await tokenBalanceEquals(OtherTestToken, buyer4, 0);
        await tokenBalanceEquals(OtherTestToken, buyer5, 0);
        await tokenBalanceEquals(OtherTestToken, buyer6, 0);
        await tokenBalanceEquals(OtherTestToken, feeTeamMember, 0);
    });

});

