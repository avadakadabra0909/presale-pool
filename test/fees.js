const chai = require('chai');

const server = require('./server');
const util = require('./util');

const expect = chai.expect;

describe('fees', () => {
    let creator;
    let addresses;
    let web3;

    before(async () => {
        let result = await server.setUp();
        web3 = result.web3;
        creator = result.addresses[0].toLowerCase();
        team = [result.addresses[1].toLowerCase()];
        payoutAddress = result.addresses[2].toLowerCase();
        addresses = result.addresses;
    });

    after(() => {
        server.tearDown();
    });

    it('fees must be less than 50%', async () => {
        let PPFeeManager = await util.deployContract(
            web3,
            "PPFeeManager",
            creator,
            [[addresses[1].toLowerCase()]]
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
        await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                feesPercentage: web3.utils.toWei(0.49, "ether"),
                feeManager: PPFeeManager.options.address
            })
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
        let blacklistedBuyer = addresses[2];
        let TestToken = await util.deployContract(
            web3,
            "TestToken",
            creator,
            [blacklistedBuyer]
        );

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            web3.utils.toWei(2, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.payToPresale(payoutAddress, 0),
            creator
        );

        await util.methodWithGas(
            TestToken.methods.transfer(
                PresalePool.options.address, 60
            ),
            creator
        );
        await util.methodWithGas(PresalePool.methods.setToken(TestToken.options.address), creator);

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
        let blacklistedBuyer = addresses[2];
        let TestToken = await util.deployContract(
            web3,
            "TestToken",
            creator,
            [blacklistedBuyer]
        );

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            web3.utils.toWei(2, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.payToPresale(payoutAddress, 0),
            creator
        );

        await util.methodWithGas(
            TestToken.methods.transfer(
                PresalePool.options.address, 60
            ),
            creator
        );
        await util.methodWithGas(PresalePool.methods.setToken(TestToken.options.address), creator);

        let expectedPayout = web3.utils.toWei(0.02, "ether");
        let beforeBalance = await web3.eth.getBalance(creator);

        await util.methodWithGas(
            PresalePool.methods.transferAndDistributeFees(),
            blacklistedBuyer
        );

        let afterBalance = await web3.eth.getBalance(creator);
        let difference = parseInt(afterBalance) - parseInt(beforeBalance);
        expect(difference / expectedPayout).to.be.within(.98, 1.0);
    });
});

