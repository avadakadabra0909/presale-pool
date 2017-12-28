const chai = require('chai');

const server = require('./server');
const util = require('./util');

const expect = chai.expect;

describe('autoDistribute', () => {
    let creator;
    let addresses;
    let buyer1;
    let buyer2;
    let buyer3;
    let gasFeeRecipient;
    let web3;
    let PBFeeManager;

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
        let feeTeamMember = addresses[8].toLowerCase();
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

    after(async () => {
        await server.tearDown();
    });

    it('cant be deployed with more than 10 token drops', async () => {
        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                feeManager: PBFeeManager.options.address,
                minContribution: web3.utils.toWei(10, "ether"),
                maxContribution: web3.utils.toWei(50, "ether"),
                maxPoolBalance: web3.utils.toWei(50, "ether"),
                totalTokenDrops: 10
            })
        );

        expect(
            parseInt(await PresalePool.methods.totalTokenDrops().call())
        ).to.be.equal(10);

        await util.expectVMException(
            util.deployContract(
                web3,
                "PresalePool",
                creator,
                util.createPoolArgs({
                    feeManager: PBFeeManager.options.address,
                    minContribution: web3.utils.toWei(10, "ether"),
                    maxContribution: web3.utils.toWei(50, "ether"),
                    maxPoolBalance: web3.utils.toWei(50, "ether"),
                    totalTokenDrops: 11
                })
            )
        );
    });

    it('setTokenDrops capped at 10, can only be called by creator', async () => {
        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                feeManager: PBFeeManager.options.address,
                minContribution: web3.utils.toWei(10, "ether"),
                maxContribution: web3.utils.toWei(50, "ether"),
                maxPoolBalance: web3.utils.toWei(50, "ether"),
            })
        );

        expect(
            parseInt(await PresalePool.methods.totalTokenDrops().call())
        ).to.be.equal(0);

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.setTokenDrops(11),
                creator
            )
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.setTokenDrops(2),
                addresses[1]
            )
        );

        await util.methodWithGas(
            PresalePool.methods.setTokenDrops(10),
            creator
        );

        expect(
            parseInt(await PresalePool.methods.totalTokenDrops().call())
        ).to.be.equal(10);
    });


    it('setTokenDrops cant be called in failed state', async () => {
        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                feeManager: PBFeeManager.options.address,
                minContribution: web3.utils.toWei(10, "ether"),
                maxContribution: web3.utils.toWei(50, "ether"),
                maxPoolBalance: web3.utils.toWei(50, "ether"),
            })
        );

        await util.methodWithGas(
            PresalePool.methods.fail(),
            creator
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.setTokenDrops(2),
                creator
            )
        );
    });

    it('setTokenDrops cant be called in paid state', async () => {
        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                feeManager: PBFeeManager.options.address,
                minContribution: web3.utils.toWei(1, "ether"),
                maxContribution: web3.utils.toWei(50, "ether"),
                maxPoolBalance: web3.utils.toWei(50, "ether"),
            })
        );

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            web3.utils.toWei(5, "ether")
        );

        await util.methodWithGas(
            PresalePool.methods.payToPresale(
                creator,
                0, 0, '0x'
            ),
            creator
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.setTokenDrops(2),
                creator
            )
        );
    });

    it('setTokenDrops cant be called in refund state', async () => {
        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                feeManager: PBFeeManager.options.address,
                minContribution: web3.utils.toWei(1, "ether"),
                maxContribution: web3.utils.toWei(50, "ether"),
                maxPoolBalance: web3.utils.toWei(50, "ether"),
            })
        );

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            web3.utils.toWei(5, "ether")
        );

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
                PresalePool.methods.setTokenDrops(2),
                creator
            )
        );
    });


    it('minContribution must be at least twice gas cost', async () => {
        let gasCost = util.distributionGasCosts({ numContributors: 1, numDrops: 1 });
        await util.expectVMException(
            util.deployContract(
                web3,
                "PresalePool",
                creator,
                util.createPoolArgs({
                    feeManager: PBFeeManager.options.address,
                    minContribution: gasCost,
                    maxContribution: web3.utils.toWei(50, "ether"),
                    maxPoolBalance: web3.utils.toWei(50, "ether"),
                    totalTokenDrops: 1
                })
            )
        );

        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                feeManager: PBFeeManager.options.address,
                minContribution: 2*gasCost,
                maxContribution: web3.utils.toWei(50, "ether"),
                maxPoolBalance: web3.utils.toWei(50, "ether"),
                totalTokenDrops: 1
            })
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.setContributionSettings(
                    1.9999*gasCost,
                    web3.utils.toWei(50, "ether"),
                    web3.utils.toWei(50, "ether"),
                    []
                ),
                creator
            )
        );

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                2.0001*gasCost,
                web3.utils.toWei(50, "ether"),
                web3.utils.toWei(50, "ether"),
                []
            ),
            creator
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.setTokenDrops(3),
                creator
            )
        );

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                6*gasCost,
                web3.utils.toWei(50, "ether"),
                web3.utils.toWei(50, "ether"),
                []
            ),
            creator
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer1,
                5*gasCost
            )
        );

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            6*gasCost
        );

        await util.methodWithGas(
            PresalePool.methods.setTokenDrops(3),
            creator
        );

        expect(
            parseInt(
                await PresalePool.methods.totalTokenDrops().call()
            )
        ).to.be.equal(3);

        await util.methodWithGas(
            PresalePool.methods.setTokenDrops(0),
            creator
        );

        expect(
            parseInt(
                await PresalePool.methods.totalTokenDrops().call()
            )
        ).to.be.equal(0);

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer2,
                1
            )
        );

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                web3.utils.toWei(50, "ether"),
                web3.utils.toWei(50, "ether"),
                []
            ),
            creator
        );

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer2,
            1
        );
    });

    describe("transferAutoDistributionFees", () => {
        let PresalePool;
        const totalTokenDrops = 3;
        beforeEach(async () => {
            PresalePool = await util.deployContract(
                web3,
                "PresalePool",
                creator,
                util.createPoolArgs({
                    minContribution: web3.utils.toWei(1, "ether"),
                    feeManager: PBFeeManager.options.address,
                    maxContribution: web3.utils.toWei(50, "ether"),
                    maxPoolBalance: web3.utils.toWei(50, "ether"),
                    totalTokenDrops: totalTokenDrops,
                    autoDistributeGasRecipient: gasFeeRecipient
                })
            );
        });

        it('does not send gas fees on fail() if no one has deposited', async () => {
            await util.expectBalanceChange(web3, gasFeeRecipient, 0, () => {
                util.methodWithGas(
                    PresalePool.methods.fail(),
                    creator
                )
            });
        });

        it('does not send gas fees on fail() if no one has contributions', async () => {
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
                PresalePool.methods.modifyWhitelist([], [buyer1, buyer2]),
                creator
            );

            let expectedBalances = {}
            expectedBalances[buyer1] = {
                remaining: web3.utils.toWei(5, "ether"),
                contribution: web3.utils.toWei(0, "ether"),
                whitelisted: false
            }
            expectedBalances[buyer2] = {
                remaining: web3.utils.toWei(3, "ether"),
                contribution: web3.utils.toWei(0, "ether"),
                whitelisted: false
            }
            await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei(8, "ether"));


            await util.expectBalanceChange(web3, gasFeeRecipient, 0, () => {
                util.methodWithGas(
                    PresalePool.methods.fail(),
                    creator
                )
            });
        });

        async function setUpContributionsAndWhitelist() {
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
        }

        it('send gas fees on fail() only for those with contributions', async () => {
            await setUpContributionsAndWhitelist();
            let gasCost = util.distributionGasCosts({ numContributors: 2, numDrops: 1 });
            await util.expectBalanceChange(web3, gasFeeRecipient, gasCost, () => {
                return util.methodWithGas(
                    PresalePool.methods.fail(),
                    creator
                )
            });
        });

        it('send gas fees on payToPresale() only for those with contributions', async () => {
            await setUpContributionsAndWhitelist();
            let gasCost = util.distributionGasCosts({ numContributors: 2, numDrops: totalTokenDrops });
            await util.expectBalanceChange(web3, gasFeeRecipient, gasCost, () => {
                return util.methodWithGas(
                    PresalePool.methods.payToPresale(creator, 0, 0, '0x'),
                    creator
                )
            });
        });

    });

});

