const chai = require('chai');

const server = require('./server');
const util = require('./util');

const expect = chai.expect;

describe('Chaining pools', () => {
    let creator;
    let otherCreator;
    let addresses;
    let buyer1;
    let buyer2;
    let buyer3;
	let buyer4;
	let buyer5;
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
        otherCreator = addresses[7].toLowerCase();
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
                util.toWei(web3, 0.005, "ether"),
                util.toWei(web3, 0.01, "ether")
            ]
        );
    });

    let PresalePool;
    let OtherPool;
    beforeEach(async () => {
        PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                minContribution: util.toWei(web3, 1, "ether"),
                feeManager: PBFeeManager.options.address,
                maxContribution: util.toWei(web3, 50, "ether"),
                maxPoolBalance: util.toWei(web3, 50, "ether"),
            }),
            0,
            { 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
        );

        OtherPool = await util.deployContract(
            web3,
            "PresalePool",
            otherCreator,
            util.createPoolArgs({
                minContribution: util.toWei(web3, 1, "ether"),
                feeManager: PBFeeManager.options.address,
                maxContribution: util.toWei(web3, 50, "ether"),
                maxPoolBalance: util.toWei(web3, 50, "ether"),
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
            util.toWei(web3, 5, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer2,
            util.toWei(web3, 2.5, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer3,
            util.toWei(web3, 10, "ether")
        );


        await util.methodWithGas(
            OtherPool.methods.deposit(),
            buyer4,
            util.toWei(web3, 1, "ether")
        );
        await util.methodWithGas(
            OtherPool.methods.deposit(),
            buyer5,
            util.toWei(web3, 2, "ether")
        );

        let depositBytecode = PresalePool.methods.deposit().encodeABI();
        await util.methodWithGas(
            OtherPool.methods.payToPresale(
                PresalePool.options.address,
                0, 0, depositBytecode
            ),
            otherCreator
        );

        let expectedBalances = {};
        expectedBalances[buyer1] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 5, "ether"),
        };
        expectedBalances[buyer2] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 2.5, "ether"),
        };
        expectedBalances[buyer3] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 10, "ether"),
        };
        expectedBalances[OtherPool.options.address.toLowerCase()] = {
            remaining: util.toWei(web3, 0, "ether"),
            contribution: util.toWei(web3, 3*0.995, "ether"),
        };
        await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 3*0.995 +17.5, "ether"));
    });


    after(async () => {
        await server.tearDown();
    });

    async function tokenBalanceEquals(TokenContract, address, amount) {
        expect(
            parseInt(
                await TokenContract.methods.balanceOf(address).call()
            )
        ).to.equal(amount);
    }

    it('distributes tokens', async () => {
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

        await util.methodWithGas(
            PresalePool.methods.transferTokensToAll(
                TestToken.options.address
            ),
            creator
        );

        await util.methodWithGas(
            OtherPool.methods.confirmTokens(TestToken.options.address, true),
            otherCreator
        );

        await util.methodWithGas(
            OtherPool.methods.transferTokensToAll(
                TestToken.options.address
            ),
            otherCreator
        );

        let b1 = await TestToken.methods.balanceOf(buyer1).call();
        let b2 = await TestToken.methods.balanceOf(buyer2).call();
        let b3 = await TestToken.methods.balanceOf(buyer3).call();
        let b4 = await TestToken.methods.balanceOf(buyer4).call();
        let b5 = await TestToken.methods.balanceOf(buyer5).call();

        let denominator = 3*0.995 +17.5;
        await tokenBalanceEquals(TestToken, buyer1, Math.floor(5*60 / denominator));
        await tokenBalanceEquals(TestToken, buyer2, Math.floor(2.5*60 / denominator));
        await tokenBalanceEquals(TestToken, buyer3, Math.floor(10*60 / denominator));
        await tokenBalanceEquals(TestToken, buyer4, Math.floor(60 / denominator));
        await tokenBalanceEquals(TestToken, buyer5, Math.floor(2*60 / denominator));
    });

    it('distributes ether after cancellation', async () => {
        await util.methodWithGas(
            PresalePool.methods.fail(),
            creator
        );

        await util.methodWithGas(
            OtherPool.methods.expectRefund(
                PresalePool.options.address
            ),
            otherCreator
        );

        let withdrawAllBytecode = PresalePool.methods.withdrawAll().encodeABI();
        await util.methodWithGas(
            OtherPool.methods.forwardTransaction(
                PresalePool.options.address,
                0,
                withdrawAllBytecode
            ),
            otherCreator
        );

        await util.expectBalanceChanges(
            web3,
            [buyer4, buyer5],
            [1, 2].map(x => util.toWei(web3, x, "ether")),
            () => {
                return util.methodWithGas(
                    OtherPool.methods.withdrawAllForMany([
                        buyer4,
                        buyer5
                    ]),
                    creator
                );
            }
        );
    });

});

