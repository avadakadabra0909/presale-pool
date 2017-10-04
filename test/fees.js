const chai = require('chai');

const server = require('./server');
const util = require('./util');

const expect = chai.expect;

describe('fees', () => {
    let creator;
    let addresses;
    let web3;
    let team;

    before(async () => {
        let result = await server.setUp();
        web3 = result.web3;
        creator = result.addresses[0].toLowerCase();
        team = [result.addresses[1].toLowerCase()];
        addresses = result.addresses;
    });

    after(async () => {
        await server.tearDown();
    });

    it('fees must be less than 50%', async () => {
        let PPFeeManager = await util.deployContract(
            web3,
            "PPFeeManager",
            creator,
            [[addresses[1].toLowerCase()]]
        );
        await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                feesPercentage: web3.utils.toWei(0.49, "ether"),
                feeManager: PPFeeManager.options.address
            })
        );
        await util.expectVMException(
            util.deployContract(
                web3,
                "PresalePool",
                creator,
                util.createPoolArgs({
                    feesPercentage: web3.utils.toWei(0.5, "ether"),
                    feeManager: PPFeeManager.options.address
                })
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
                    feesPercentage: web3.utils.toWei(0.49, "ether"),
                    feeManager: addresses[1].toLowerCase()
                })
            )
        );
    });

    it('cannot transferFees in open state or failed state', async () => {
        let FeeManager = await util.deployContract(
            web3,
            "PPFeeManager",
            creator,
            [team]
        );
        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                feesPercentage: web3.utils.toWei(0.2, "ether"),
                feeManager: FeeManager.options.address
            })
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

    it('cannot transferFees in paid state', async () => {
        let FeeManager = await util.deployContract(
            web3,
            "PPFeeManager",
            creator,
            [team]
        );
        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                feesPercentage: web3.utils.toWei(0.2, "ether"),
                feeManager: FeeManager.options.address
            })
        );

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            web3.utils.toWei(2, "ether")
        );
        let payoutAddress = addresses[5];
        await util.methodWithGas(
            PresalePool.methods.payToPresale(payoutAddress, 0),
            creator
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

    it('cannot transferFees in failed state from refund', async () => {
        let FeeManager = await util.deployContract(
            web3,
            "PPFeeManager",
            creator,
            [team]
        );
        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                feesPercentage: web3.utils.toWei(0.2, "ether"),
                feeManager: FeeManager.options.address
            })
        );

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            web3.utils.toWei(2, "ether")
        );
        let payoutAddress = addresses[5];
        await util.methodWithGas(
            PresalePool.methods.payToPresale(payoutAddress, 0),
            creator
        );
        await util.methodWithGas(
            PresalePool.methods.refundPresale(),
            payoutAddress,
            web3.utils.toWei(101, "ether")
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

    it('transferFees succeeds on TokensReady state', async () => {
        let FeeManager = await util.deployContract(
            web3,
            "PPFeeManager",
            creator,
            [team]
        );
        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                feesPercentage: web3.utils.toWei(0.02, "ether"),
                feeManager: FeeManager.options.address
            })
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
            web3.utils.toWei(2, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.payToPresale(TestToken.options.address, 0),
            creator
        );
        await util.methodWithGas(
            PresalePool.methods.setToken(TestToken.options.address),
            creator
        );

        let expectedPayout = web3.utils.toWei(2*.02, "ether");
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

    it('transferAndDistributeFees succeeds on TokensReady state', async () => {
        let FeeManager = await util.deployContract(
            web3,
            "PPFeeManager",
            creator,
            [team]
        );
        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                feesPercentage: web3.utils.toWei(0.02, "ether"),
                feeManager: FeeManager.options.address
            })
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
            web3.utils.toWei(4, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            web3.utils.toWei(2, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.payToPresale(TestToken.options.address, 0),
            creator
        );
        await util.methodWithGas(
            PresalePool.methods.setToken(TestToken.options.address),
            creator
        );

        let expectedPayout = web3.utils.toWei(6*0.01, "ether");
        let beforeBalance = await web3.eth.getBalance(creator);

        await util.methodWithGas(
            PresalePool.methods.transferAndDistributeFees(),
            buyer1
        );

        let afterBalance = await web3.eth.getBalance(creator);
        let difference = parseInt(afterBalance) - parseInt(beforeBalance);
        expect(difference / expectedPayout).to.be.within(.98, 1.0);

        await util.methodWithGas(PresalePool.methods.transferAllTokens(), creator);
        expect(await TestToken.methods.balanceOf(creator).call())
        .to.equal("40");
        expect(await TestToken.methods.balanceOf(buyer1).call())
        .to.equal("20");
    });

    it('distribute tokens then collect fees', async () => {
        let FeeManager = await util.deployContract(
            web3,
            "PPFeeManager",
            creator,
            [team]
        );
        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                feesPercentage: web3.utils.toWei(0.02, "ether"),
                feeManager: FeeManager.options.address
            })
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
            web3.utils.toWei(4, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            web3.utils.toWei(2, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.payToPresale(TestToken.options.address, 0),
            creator
        );
        await util.methodWithGas(
            PresalePool.methods.setToken(TestToken.options.address),
            creator
        );

        await util.methodWithGas(PresalePool.methods.transferAllTokens(), creator);
        expect(await TestToken.methods.balanceOf(creator).call())
        .to.equal("40");
        expect(await TestToken.methods.balanceOf(buyer1).call())
        .to.equal("20");


        let expectedPayout = web3.utils.toWei(6*.02, "ether");
        let beforeBalance = await web3.eth.getBalance(FeeManager.options.address);

        await util.methodWithGas(
            PresalePool.methods.transferFees(),
            creator
        );

        let afterBalance = await web3.eth.getBalance(FeeManager.options.address);
        let difference = parseInt(afterBalance) - parseInt(beforeBalance);
        expect(difference / expectedPayout).to.be.within(.98, 1.0);
    });
});

