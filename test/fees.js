const chai = require('chai');

const server = require('./server');
const util = require('./util');
const BigNumber = util.BigNumber;

const expect = chai.expect;

describe('fees', () => {
    let creator;
    let addresses;
    let web3;
    let team;
    let tokenHolder;
    let PresalePoolLib;

    before(async () => {
        let result = await server.setUp();
        web3 = result.web3;
        creator = result.addresses[0].toLowerCase();
        team = [result.addresses[1].toLowerCase()];
        tokenHolder = result.addresses[2].toLowerCase();
        addresses = result.addresses;
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

    it('fees must be less than 50%', async () => {
        let PBFeeManager = await util.deployContract(
            web3,
            "PBFeeManager",
            creator,
            [
                team,
                util.toWei(web3, 0.005, "ether"),
                util.toWei(web3, 0.01, "ether")
            ]
        );

        await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                creatorFeesPerEther: util.toWei(web3, 0.46, "ether"),
                feeManager: PBFeeManager.options.address,
                maxContribution: util.toWei(web3, 50, "ether"),
                maxPoolBalance: util.toWei(web3, 50, "ether")
            }),
            0,
            { 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
        );

        await util.expectVMException(
            util.deployContract(
                web3,
                "PresalePool",
                creator,
                util.createPoolArgs({
                    creatorFeesPerEther: util.toWei(web3, 0.5, "ether"),
                    feeManager: PBFeeManager.options.address,
                    maxContribution: util.toWei(web3, 50, "ether"),
                    maxPoolBalance: util.toWei(web3, 50, "ether")
                }),
                0,
                { 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
            )
        );
    });

    it('feeManager must be valid', async () => {
        await util.expectVMException(
            util.deployContract(
                web3,
                "PresalePool",
                creator,
                util.createPoolArgs({
                    feesPerEther: util.toWei(web3, 0.49, "ether"),
                    feeManager: addresses[1].toLowerCase(),
                    maxContribution: util.toWei(web3, 50, "ether"),
                    maxPoolBalance: util.toWei(web3, 50, "ether")
                }),
                0,
                { 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
            )
        );
    });

    it('cannot transferFees in open state or failed state', async () => {
        let FeeManager = await util.deployContract(
            web3,
            "PBFeeManager",
            creator,
            [
                team,
                util.toWei(web3, 0.005, "ether"),
                util.toWei(web3, 0.01, "ether")
            ]
        );

        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                creatorFeesPerEther: util.toWei(web3, 0.2, "ether"),
                feeManager: FeeManager.options.address,
                maxContribution: util.toWei(web3, 50, "ether"),
                maxPoolBalance: util.toWei(web3, 50, "ether")
            }),
            0,
            { 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
        );

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            util.toWei(web3, 2, "ether")
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.transferFees(),
                creator
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.transferAndDistributeFees(),
                creator
            )
        );

        await util.methodWithGas(
            PresalePool.methods.fail(),
            creator
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.discountFees(0, 0),
                team[0]
            )
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.transferFees(),
                creator
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.transferAndDistributeFees(),
                creator
            )
        );
    });

    it('cannot transferFees in refund state', async () => {
        let FeeManager = await util.deployContract(
            web3,
            "PBFeeManager",
            creator,
            [
                team,
                util.toWei(web3, 0.005, "ether"),
                util.toWei(web3, 0.01, "ether")
            ]
        );

        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                creatorFeesPerEther: util.toWei(web3, 0.2, "ether"),
                feeManager: FeeManager.options.address,
                maxContribution: util.toWei(web3, 50, "ether"),
                maxPoolBalance: util.toWei(web3, 50, "ether")
            }),
            0,
            { 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
        );

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            util.toWei(web3, 2, "ether")
        );
        let payoutAddress = addresses[5];
        await util.methodWithGas(
            PresalePool.methods.payToPresale(payoutAddress, 0, 0, '0x'),
            creator
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.discountFees(0, 0),
                team[0]
            )
        );

        await util.methodWithGas(
            PresalePool.methods.expectRefund(payoutAddress),
            creator
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.discountFees(0, 0),
                team[0]
            )
        );

        await web3.eth.sendTransaction({
            from: payoutAddress,
            to: PresalePool.options.address,
            value: util.toWei(web3, 101, "ether")
        });

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.transferFees(),
                creator
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.transferAndDistributeFees(),
                creator
            )
        );
    });

    it('discount can only be applied by team member', async () => {
        let FeeManager = await util.deployContract(
            web3,
            "PBFeeManager",
            creator,
            [
                team,
                util.toWei(web3, 0.005, "ether"),
                util.toWei(web3, 0.01, "ether")
            ]
        );

        let Proxy = await util.deployContract(
            web3,
            "Proxy",
            creator,
            []
        );

        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                creatorFeesPerEther: util.toWei(web3, 0.02, "ether"),
                feeManager: FeeManager.options.address,
                maxContribution: util.toWei(web3, 50, "ether"),
                maxPoolBalance: util.toWei(web3, 50, "ether")
            }),
            0,
            { 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.discountFees(0, 0),
                creator
            )
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.discountFees(0, 0),
                creator
            )
        );

        let data = PresalePool.methods.discountFees(0, 0).encodeABI();
        await util.expectVMException(
            util.methodWithGas(
                Proxy.methods.proxy(PresalePool.options.address, data),
                team[0]
            )
        );

        await web3.eth.sendTransaction({
            from: team[0],
            to: PresalePool.options.address,
            data: data
        });

        let fees = await FeeManager.methods.getTotalFeesPerEther().call({
            from: PresalePool.options.address
        });
        expect(parseInt(fees)).to.be.equal(0);
    });

    it('fee after discount cannot exceed original fee', async () => {
        let FeeManager = await util.deployContract(
            web3,
            "PBFeeManager",
            creator,
            [
                team,
                util.toWei(web3, 0.005, "ether"),
                util.toWei(web3, 0.01, "ether")
            ]
        );

        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                creatorFeesPerEther: util.toWei(web3, 0.02, "ether"),
                feeManager: FeeManager.options.address,
                maxContribution: util.toWei(web3, 50, "ether"),
                maxPoolBalance: util.toWei(web3, 50, "ether")
            }),
            0,
            { 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
        );

        let fees = await FeeManager.methods.getTotalFeesPerEther().call({
            from: PresalePool.options.address
        });
        expect(fees).to.be.equal(util.toWei(web3, 0.03, "ether"));

        await util.methodWithGas(
            PresalePool.methods.discountFees(util.toWei(web3, 0.02, "ether"), util.toWei(web3, 0.01, "ether")),
            team[0]
        );
        fees = await FeeManager.methods.getTotalFeesPerEther().call({
            from: PresalePool.options.address
        });
        expect(fees).to.be.equal(util.toWei(web3, 0.03, "ether"));

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.discountFees(util.toWei(web3, 0.021, "ether"), util.toWei(web3, 0.01, "ether")),
                team[0]
            )
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.discountFees(util.toWei(web3, 0.020, "ether"), util.toWei(web3, 0.011, "ether")),
                team[0]
            )
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.discountFees(util.toWei(web3, 0.31, "ether"), 0),
                team[0]
            )
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.discountFees(0, util.toWei(web3, 0.31, "ether")),
                team[0]
            )
        );
    });

    it('discount total fee to 0', async () => {
        let FeeManager = await util.deployContract(
            web3,
            "PBFeeManager",
            creator,
            [
                team,
                util.toWei(web3, 0.005, "ether"),
                util.toWei(web3, 0.01, "ether")
            ]
        );

        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                creatorFeesPerEther: util.toWei(web3, 0.02, "ether"),
                feeManager: FeeManager.options.address,
                maxContribution: util.toWei(web3, 50, "ether"),
                maxPoolBalance: util.toWei(web3, 50, "ether")
            }),
            0,
            { 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
        );

        let fees = await FeeManager.methods.getTotalFeesPerEther().call({
            from: PresalePool.options.address
        });
        expect(fees).to.be.equal(util.toWei(web3, 0.03, "ether"));

        await util.methodWithGas(
            PresalePool.methods.discountFees(0, 0),
            team[0]
        );
        fees = await FeeManager.methods.getTotalFeesPerEther().call({
            from: PresalePool.options.address
        });
        expect(parseInt(fees)).to.be.equal(0);

        let buyer1 = addresses[3];
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            util.toWei(web3, 4, "ether")
        );

        let payoutAddress = addresses[4];
        await util.expectBalanceChange(web3, payoutAddress, util.toWei(web3, 4, "ether"), () =>{
            return util.methodWithGas(
                PresalePool.methods.payToPresale(payoutAddress, 0, 0, '0x'),
                creator
            );
        });
    });

    it('discount team fee to 0', async () => {
        let FeeManager = await util.deployContract(
            web3,
            "PBFeeManager",
            creator,
            [
                team,
                util.toWei(web3, 0.005, "ether"),
                util.toWei(web3, 0.01, "ether")
            ]
        );

        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                creatorFeesPerEther: util.toWei(web3, 0.02, "ether"),
                feeManager: FeeManager.options.address,
                maxContribution: util.toWei(web3, 50, "ether"),
                maxPoolBalance: util.toWei(web3, 50, "ether")
            }),
            0,
            { 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
        );

        let fees = await FeeManager.methods.getTotalFeesPerEther().call({
            from: PresalePool.options.address
        });
        expect(fees).to.be.equal(util.toWei(web3, 0.03, "ether"));

        await util.methodWithGas(
            PresalePool.methods.discountFees(
                util.toWei(web3, 0.02, "ether"),
                0
            ),
            team[0]
        );
        fees = await FeeManager.methods.getTotalFeesPerEther().call({
            from: PresalePool.options.address
        });
        expect(fees).to.be.equal(util.toWei(web3, 0.02, "ether"));

        let buyer1 = addresses[3];
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            util.toWei(web3, 10, "ether")
        );

        let TestToken = await util.deployContract(
            web3,
            "TestToken",
            creator,
            [addresses[2]]
        );

        await util.expectBalanceChange(web3, TestToken.options.address, util.toWei(web3, 10*0.98, "ether"), () =>{
            return util.methodWithGas(
                PresalePool.methods.payToPresale(TestToken.options.address, 0, 0, '0x'),
                creator
            );
        });

        await util.expectBalanceChanges(
            web3,
            [team[0], creator],
            [0, 10*0.02].map(x => util.toWei(web3, x, "ether")), async () => {
                await util.methodWithGas(
                    PresalePool.methods.confirmTokens(TestToken.options.address, true),
                    creator
                );
                await util.methodWithGas(
                    FeeManager.methods.claimMyTeamFees(),
                    team[0]
                );
            }
        );
    });

    it('discount creator fee to 0', async () => {
        let FeeManager = await util.deployContract(
            web3,
            "PBFeeManager",
            creator,
            [
                team,
                util.toWei(web3, 0.005, "ether"),
                util.toWei(web3, 0.01, "ether")
            ]
        );

        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                creatorFeesPerEther: util.toWei(web3, 0.02, "ether"),
                feeManager: FeeManager.options.address,
                maxContribution: util.toWei(web3, 50, "ether"),
                maxPoolBalance: util.toWei(web3, 50, "ether")
            }),
            0,
            { 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
        );

        let fees = await FeeManager.methods.getTotalFeesPerEther().call({
            from: PresalePool.options.address
        });
        expect(fees).to.be.equal(util.toWei(web3, 0.03, "ether"));

        await util.methodWithGas(
            PresalePool.methods.discountFees(
                0,
                util.toWei(web3, 0.02, "ether")
            ),
            team[0]
        );
        fees = await FeeManager.methods.getTotalFeesPerEther().call({
            from: PresalePool.options.address
        });
        expect(fees).to.be.equal(util.toWei(web3, 0.02, "ether"));

        let buyer1 = addresses[3];
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            util.toWei(web3, 10, "ether")
        );

        let TestToken = await util.deployContract(
            web3,
            "TestToken",
            creator,
            [addresses[2]]
        );

        await util.expectBalanceChange(web3, TestToken.options.address, util.toWei(web3, 10*0.98, "ether"), () =>{
            return util.methodWithGas(
                PresalePool.methods.payToPresale(TestToken.options.address, 0, 0, '0x'),
                creator
            );
        });

        await util.expectBalanceChanges(
            web3,
            [team[0], creator],
            [10*0.02, 0].map(x => util.toWei(web3, x, "ether")), async () => {
                await util.methodWithGas(
                    PresalePool.methods.confirmTokens(TestToken.options.address, true),
                    creator
                );
                await util.methodWithGas(
                    FeeManager.methods.claimMyTeamFees(),
                    team[0]
                );
            }
        );
    });

    it('discount fees but not to 0', async () => {
        let FeeManager = await util.deployContract(
            web3,
            "PBFeeManager",
            creator,
            [
                team,
                util.toWei(web3, 0.005, "ether"),
                util.toWei(web3, 0.01, "ether")
            ]
        );

        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                creatorFeesPerEther: util.toWei(web3, 0.02, "ether"),
                feeManager: FeeManager.options.address,
                maxContribution: util.toWei(web3, 50, "ether"),
                maxPoolBalance: util.toWei(web3, 50, "ether")
            }),
            0,
            { 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
        );

        let fees = await FeeManager.methods.getTotalFeesPerEther().call({
            from: PresalePool.options.address
        });
        expect(fees).to.be.equal(util.toWei(web3, 0.03, "ether"));

        await util.methodWithGas(
            PresalePool.methods.discountFees(
                util.toWei(web3, 0.01, "ether"),
                util.toWei(web3, 0.015, "ether")
            ),
            team[0]
        );
        fees = await FeeManager.methods.getTotalFeesPerEther().call({
            from: PresalePool.options.address
        });
        expect(fees).to.be.equal(util.toWei(web3, 0.025, "ether"));

        let buyer1 = addresses[6];
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            util.toWei(web3, 20, "ether")
        );

        let TestToken = await util.deployContract(
            web3,
            "TestToken",
            creator,
            [addresses[2]]
        );

        await util.expectBalanceChange(web3, TestToken.options.address, util.toWei(web3, 20*0.975, "ether"), () =>{
            return util.methodWithGas(
                PresalePool.methods.payToPresale(TestToken.options.address, 0, 0, '0x'),
                creator
            );
        });

        await util.expectBalanceChanges(
            web3,
            [team[0], creator],
            [20*0.015, 20*0.01].map(x => util.toWei(web3, x, "ether")), async () => {
                await util.methodWithGas(
                    PresalePool.methods.confirmTokens(TestToken.options.address, true),
                    creator
                );
                await util.methodWithGas(
                    FeeManager.methods.claimMyTeamFees(),
                    team[0]
                );
            }
        );
    });

    it('transferFees succeeds after tokens have been confirmed', async () => {
        let FeeManager = await util.deployContract(
            web3,
            "PBFeeManager",
            creator,
            [
                team,
                util.toWei(web3, 0.005, "ether"),
                util.toWei(web3, 0.01, "ether")
            ]
        );

        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                creatorFeesPerEther: util.toWei(web3, 0.02, "ether"),
                feeManager: FeeManager.options.address,
                maxContribution: util.toWei(web3, 50, "ether"),
                maxPoolBalance: util.toWei(web3, 50, "ether")
            }),
            0,
            { 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
        );
        let TestToken = await util.deployContract(
            web3,
            "TestToken",
            creator,
            [addresses[2]]
        );

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

        let expectedPayout = util.toWei(web3, 2*.03, "ether");
        let beforeBalance = await web3.eth.getBalance(FeeManager.options.address);

        await util.methodWithGas(
            PresalePool.methods.transferFees(),
            creator
        );

        let afterBalance = await web3.eth.getBalance(FeeManager.options.address);
        let difference = parseInt(afterBalance) - parseInt(beforeBalance);
        expect(difference / expectedPayout).to.be.within(.98, 1.0);

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.transferFees(),
                creator
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.transferAndDistributeFees(),
                creator
            )
        );
    });

    it('transferAndDistributeFees succeeds after tokens have been confirmed', async () => {
        let FeeManager = await util.deployContract(
            web3,
            "PBFeeManager",
            creator,
            [
                team,
                util.toWei(web3, 0.005, "ether"),
                util.toWei(web3, 0.01, "ether")
            ]
        );

        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                creatorFeesPerEther: util.toWei(web3, 0.02, "ether"),
                feeManager: FeeManager.options.address,
                maxContribution: util.toWei(web3, 50, "ether"),
                maxPoolBalance: util.toWei(web3, 50, "ether")
            }),
            0,
            { 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
        );
        let TestToken = await util.deployContract(
            web3,
            "TestToken",
            tokenHolder,
            [addresses[4]]
        );

        let buyer1 = addresses[3];
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            util.toWei(web3, 4, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            util.toWei(web3, 2, "ether")
        );

        // Pay to token contract and get 1000 tokens
        let NumTestTokenNotFormatted = new BigNumber("1000").mul(new BigNumber("10").pow(new BigNumber("18")));
        await util.methodWithGas(
            PresalePool.methods.payToPresale(TestToken.options.address, 0, 0, '0x'),
            creator
        );
        await util.methodWithGas(
            PresalePool.methods.confirmTokens(TestToken.options.address, false),
            creator
        );

        let expectedPayout = util.toWei(web3, 6*0.02, "ether");
        let beforeBalance = await web3.eth.getBalance(creator);

        await util.methodWithGas(
            PresalePool.methods.transferAndDistributeFees(),
            buyer1
        );

        let afterBalance = await web3.eth.getBalance(creator);
        let difference = parseInt(afterBalance) - parseInt(beforeBalance);
        expect(difference / expectedPayout).to.be.within(.98, 1.0);

        await util.tokenBalanceEquals(TestToken, PresalePool.options.address, NumTestTokenNotFormatted);

        await util.methodWithGas(
            PresalePool.methods.transferTokensToAll(TestToken.options.address),
            creator
        );

        const totalPoolFees = 0.025;
        const poolBalanceInWei = new BigNumber(util.toWei(web3, 6, 'ether'));
        const zero = new BigNumber(0);
        await util.tokenBalanceEquals(TestToken, creator,
            util.getTokenShare(
                new BigNumber(util.toWei(web3, 4, 'ether')),
                poolBalanceInWei,
                totalPoolFees,
                zero,
                2,
                NumTestTokenNotFormatted
            )
        );
        await util.tokenBalanceEquals(TestToken, buyer1,
            util.getTokenShare(
                new BigNumber(util.toWei(web3, 2, 'ether')),
                poolBalanceInWei,
                totalPoolFees,
                zero,
                2,
                NumTestTokenNotFormatted
            )
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.transferFees(),
                creator
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.transferAndDistributeFees(),
                creator
            )
        );
    });

    it('fees can be claimed in confirmTokens()', async () => {
        let FeeManager = await util.deployContract(
            web3,
            "PBFeeManager",
            creator,
            [
                team,
                util.toWei(web3, 0.005, "ether"),
                util.toWei(web3, 0.01, "ether")
            ]
        );

        let otherAdmin = addresses[4];
        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                creatorFeesPerEther: util.toWei(web3, 0.02, "ether"),
                feeManager: FeeManager.options.address,
                maxContribution: util.toWei(web3, 50, "ether"),
                maxPoolBalance: util.toWei(web3, 50, "ether"),
                admins: [otherAdmin]
            }),
            0,
            { 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
        );
        let TestToken = await util.deployContract(
            web3,
            "TestToken",
            creator,
            [addresses[2]]
        );

        let buyer1 = addresses[3];
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            util.toWei(web3, 8, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            util.toWei(web3, 4, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.payToPresale(TestToken.options.address, 0, 0, '0x'),
            creator
        );

        let expectedPayout = util.toWei(web3, 12*0.02, "ether");
        await util.expectBalanceChanges(
            web3,
            [creator, otherAdmin],
            [expectedPayout, 0],
            () => {
                return util.methodWithGas(
                    PresalePool.methods.confirmTokens(TestToken.options.address, true),
                    creator
                );
            }
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.transferFees(),
                creator
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.transferAndDistributeFees(),
                creator
            )
        );
    });
});

