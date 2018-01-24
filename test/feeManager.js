const chai = require('chai');

const server = require('./server');
const util = require('./util');

const expect = chai.expect;

describe('PBFeeManager', () => {
    let creator;
    let addresses;
    let web3;

    before(async () => {
        let result = await server.setUp();
        web3 = result.web3;
        creator = result.addresses[0].toLowerCase();
        addresses = result.addresses.map((s) => s.toLowerCase());
    });

    after(async () => {
        await server.tearDown();
    });

    function addressEquals(a, b) {
        expect(a.toLowerCase()).to.equal(b.toLowerCase());
    }

    async function payFees(options) {
        let {
            contractAddress,
            FeeManager,
            amount,
            expectedTeamPayout
        } = options;

        let expectedTotalRecipientsPayout = parseFloat(amount) - parseFloat(expectedTeamPayout);
        let beforeBalance = await FeeManager.methods.outstandingFeesBalance().call();

        await util.methodWithGas(
            FeeManager.methods.sendFees(),
            contractAddress,
            amount
        );

        let fees = await FeeManager.methods.getFees(contractAddress).call();
        let registeredAmount = fees[3];
        expect(amount).to.be.equal(registeredAmount);

        let afterBalance = await FeeManager.methods.outstandingFeesBalance().call();
        let difference = parseInt(afterBalance) - parseInt(beforeBalance);

        if (expectedTotalRecipientsPayout === 0) {
            let differenceInEther = parseFloat(
                util.fromWei(web3, difference, "ether")
            );
            expect(differenceInEther).to.be.closeTo(0, 0.01);
        } else {
            expect(difference / expectedTotalRecipientsPayout).to.be.within(.98, 1.0001);
        }
    }

    async function distributeFees(options) {
        let {
            contractAddress,
            recipient,
            FeeManager,
            expectedPayout
        } = options;

        await util.expectBalanceChange(web3, recipient, expectedPayout, ()=>{
            return util.methodWithGas(
                FeeManager.methods.distributeFees(contractAddress),
                creator
            );
        });
    }

    async function createFees(options) {
        let {
            team,
            contractAddress,
            recipient,
            creatorFeesPerEther,
            expectedRecipientShare,
        } = options;

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

        await util.methodWithGas(
            FeeManager.methods.create(
                creatorFeesPerEther,
                recipient
            ),
            contractAddress
        );

        let fees = await FeeManager.methods.getFees(contractAddress).call();
        let recipientNumerator = fees[0];
        let denominator = fees[1];
        let recipientShare = parseFloat(recipientNumerator) / parseInt(denominator);
        expect(recipientShare).to.be.closeTo(expectedRecipientShare, 0.001);

        return FeeManager;
    }

    async function claimMyTeamFees(options) {
        let {
            team,
            FeeManager,
            expectedPayout,
        } = options;

        for (let i = 0; i < team.length; i++ ) {
            let member = team[i];
            await util.expectBalanceChange(web3, member, expectedPayout, () => {
                return util.methodWithGas(
                    FeeManager.methods.claimMyTeamFees(),
                    member
                )
            });
        }
    }

    async function distributeTeamFees(options) {
        let {
            team,
            FeeManager,
            expectedPayout,
        } = options;

        await util.expectBalanceChangeAddresses(web3, team, expectedPayout, () =>{
            return util.methodWithGas(
                FeeManager.methods.distributeTeamFees(),
                team[0]
            );
        });
    }

    it('must have at least one team member address', async () => {
        await util.expectVMException(
            util.deployContract(
                web3,
                "PBFeeManager",
                creator,
                [
                    [],
                    util.toWei(web3, 0.005, "ether"),
                    util.toWei(web3, 0.01, "ether")
                ]
            )
        );
    });

    it('handles duplicate team members', async () => {
        let team = [creator, creator, addresses[1], creator];
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

        addressEquals(await FeeManager.methods.teamMembers(0).call(), creator);
        addressEquals(await FeeManager.methods.teamMembers(1).call(), addresses[1]);
        await util.expectVMException(
            FeeManager.methods.teamMembers(2).call()
        );
    });

    it('feesPerEther must be less than 50%', async () => {
        let team = [creator];
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

        await util.expectVMException(
            util.methodWithGas(
                FeeManager.methods.create(
                    util.toWei(web3, 0.5, "ether"),
                    creator
                ),
                creator
            )
        );

        await util.expectVMException(
            util.methodWithGas(
                FeeManager.methods.create(
                    util.toWei(web3, 1.5, "ether"),
                    creator
                ),
                creator
            )
        );

        await util.methodWithGas(
            FeeManager.methods.create(
                util.toWei(web3, 0.49, "ether"),
                creator
            ),
            creator
        );
    });

    it('can only create fee structure once', async () => {
        let team = [creator];
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

        await util.methodWithGas(
            FeeManager.methods.create(
                util.toWei(web3, 0.1, "ether"),
                creator
            ),
            creator
        );

        await util.expectVMException(
            util.methodWithGas(
                FeeManager.methods.create(
                    util.toWei(web3, 0.1, "ether"),
                    creator
                ),
                creator
            )
        );
    });

    it('splits fee accordingly', async () => {
        let team = [creator];
        let contractAddress = addresses[1];
        let recipient = addresses[2];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            creatorFeesPerEther: util.toWei(web3, .015, "ether"),
            recipient: recipient,
            expectedRecipientShare: 2/3.0,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: util.toWei(web3, 3, "ether"),
            expectedTeamPayout: util.toWei(web3, 1, "ether")
        });

        await distributeFees({
            recipient: recipient,
            FeeManager: FeeManager,
            contractAddress: contractAddress,
            expectedPayout: util.toWei(web3, 2, "ether")
        });

        await util.expectVMException(
            util.methodWithGas(
                FeeManager.methods.distributeFees(contractAddress),
                creator
            )
        );
    });

    it('caps team fee to 1%', async () => {
        let team = [creator];
        let contractAddress = addresses[1];
        let recipient = addresses[3];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            creatorFeesPerEther: util.toWei(web3, 0.03, "ether"),
            recipient: recipient,
            expectedRecipientShare: 0.75,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: util.toWei(web3, 10, "ether"),
            expectedTeamPayout: util.toWei(web3, 2.5, "ether")
        });

        await distributeFees({
            recipient: recipient,
            FeeManager: FeeManager,
            contractAddress: contractAddress,
            expectedPayout: util.toWei(web3, 7.5, "ether")
        });
    });

    it('supports a 0% creator fee', async () => {
        let team = [creator];
        let contractAddress = addresses[1];
        let recipient = addresses[2];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            creatorFeesPerEther: 0,
            recipient: recipient,
            expectedRecipientShare: 0,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: util.toWei(web3, 10, "ether"),
            expectedTeamPayout: util.toWei(web3, 10, "ether")
        });

        await distributeFees({
            recipient: recipient,
            FeeManager: FeeManager,
            contractAddress: contractAddress,
            expectedPayout: util.toWei(web3, 0, "ether")
        });

        await distributeTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: util.toWei(web3, 10, "ether")
        });
    });

    it('claimMyTeamFees can only be called by team member', async () => {
        let team = [addresses[1], addresses[2]];
        let FeeManager = await util.deployContract(
            web3,
            "PBFeeManager",
            creator,
            [
                team,
                util.toWei(web3, 0.005, "ether"),
                util.toWei(web3, 0.01, "ether")
            ],
            util.toWei(web3, 3, "ether")
        );

        await util.expectVMException(
            util.methodWithGas(
                FeeManager.methods.claimMyTeamFees(),
                addresses[3],
            )
        );

        await claimMyTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: util.toWei(web3, 1.5, "ether")
        });
    });

    it('distributeTeamFees can only be called by team member', async () => {
        let team = [addresses[1]];
        let FeeManager = await util.deployContract(
            web3,
            "PBFeeManager",
            creator,
            [
                team,
                util.toWei(web3, 0.005, "ether"),
                util.toWei(web3, 0.01, "ether")
            ],
            util.toWei(web3, 3, "ether")
        );

        await util.expectVMException(
            util.methodWithGas(
                FeeManager.methods.distributeTeamFees(),
                addresses[2],
            )
        );

        await distributeTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: util.toWei(web3, 3, "ether")
        })
    });

    it('claimMyTeamFees', async () => {
        let team = [addresses[1]];
        let contractAddress = addresses[2];
        let recipient = addresses[3];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            creatorFeesPerEther: util.toWei(web3, .01, "ether"),
            recipient: recipient,
            expectedRecipientShare: 2/3.0,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: util.toWei(web3, 10, "ether"),
            expectedTeamPayout: util.toWei(web3, 10/3.0, "ether")
        });

        await claimMyTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: util.toWei(web3, 10/3.0, "ether")
        });

        await distributeTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: util.toWei(web3, 0, "ether")
        });

        await claimMyTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: util.toWei(web3, 0, "ether")
        });
    });

    it('distributeTeamFees', async () => {
        let team = [addresses[1]];
        let contractAddress = addresses[2];
        let recipient = addresses[3];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            creatorFeesPerEther: util.toWei(web3, .01, "ether"),
            recipient: recipient,
            expectedRecipientShare: 2/3.0,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: util.toWei(web3, 10, "ether"),
            expectedTeamPayout: util.toWei(web3, 10/3.0, "ether")
        });

        await distributeTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: util.toWei(web3, 10/3.0, "ether")
        });

        await claimMyTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: util.toWei(web3, 0, "ether")
        });

        await distributeTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: util.toWei(web3, 0, "ether")
        });
    });

    it('team members cant claim more than their share', async () => {
        let team = [addresses[1], addresses[2], addresses[3]];
        let contractAddress = addresses[4];
        let recipient = addresses[5];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            creatorFeesPerEther: util.toWei(web3, .01, "ether"),
            recipient: recipient,
            expectedRecipientShare: 2/3.0,
        });

        await web3.eth.sendTransaction({
            from: addresses[7],
            to: FeeManager.options.address,
            value: util.toWei(web3, 3, "ether")
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: util.toWei(web3, 10, "ether"),
            expectedTeamPayout: util.toWei(web3, 10/3.0, "ether")
        });

        await web3.eth.sendTransaction({
            from: addresses[7],
            to: FeeManager.options.address,
            value: util.toWei(web3, 1, "ether")
        });

        let totalDonations = 4;
        let teamPayout = 10/3.0;
        let expectedInvidualPayout = util.toWei(web3,
            (totalDonations + teamPayout)/team.length,
            "ether"
        );
        for (let i = 0; i < team.length; i++) {
            await claimMyTeamFees({
                FeeManager: FeeManager,
                team: [team[i]],
                expectedPayout: expectedInvidualPayout
            });
            await claimMyTeamFees({
                FeeManager: FeeManager,
                team: [team[i]],
                expectedPayout: util.toWei(web3, 0, "ether")
            });
        }
    });

    it('claimMyTeamFees with more than 1 team member', async () => {
        let team = [addresses[1], addresses[2], addresses[3]];
        let contractAddress = addresses[4];
        let recipient = addresses[5];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            creatorFeesPerEther: util.toWei(web3, .01, "ether"),
            recipient: recipient,
            expectedRecipientShare: 2/3.0,
        });

        await web3.eth.sendTransaction({
            from: addresses[7],
            to: FeeManager.options.address,
            value: util.toWei(web3, 3, "ether")
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: util.toWei(web3, 10, "ether"),
            expectedTeamPayout: util.toWei(web3, 10/3.0, "ether")
        });

        await web3.eth.sendTransaction({
            from: addresses[7],
            to: FeeManager.options.address,
            value: util.toWei(web3, 1, "ether")
        });

        let totalDonations = 4;
        let teamPayout = 10/3.0;
        let expectedInvidualPayout = util.toWei(web3,
            (totalDonations + teamPayout)/team.length,
            "ether"
        );
        await claimMyTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: expectedInvidualPayout
        });

        await distributeTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: util.toWei(web3, 0, "ether")
        });

        await claimMyTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: util.toWei(web3, 0, "ether")
        });
    });

    it('distributeTeamFees with more than 1 team member', async () => {
        let team = [addresses[1], addresses[2]];
        let contractAddress = addresses[4];
        let recipient = addresses[5];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            creatorFeesPerEther: util.toWei(web3, .01, "ether"),
            recipient: recipient,
            expectedRecipientShare: 2/3.0,
        });

        await web3.eth.sendTransaction({
            from: addresses[7],
            to: FeeManager.options.address,
            value: util.toWei(web3, 3, "ether")
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: util.toWei(web3, 10, "ether"),
            expectedTeamPayout: util.toWei(web3, 10/3.0, "ether")
        });

        await web3.eth.sendTransaction({
            from: addresses[7],
            to: FeeManager.options.address,
            value: util.toWei(web3, 1, "ether")
        });

        let totalDonations = 4;
        let teamPayout = 10/3.0;
        let expectedInvidualPayout = util.toWei(web3,
            (totalDonations + teamPayout)/team.length,
            "ether"
        );
        await distributeTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: expectedInvidualPayout
        });
    });


    it('distributeFees and claimTeem fees with more than 1 team member', async () => {
        let team = [addresses[1], addresses[2], addresses[3]];
        let contractAddress = addresses[4];
        let recipient = addresses[5];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            creatorFeesPerEther: util.toWei(web3, .01, "ether"),
            recipient: recipient,
            expectedRecipientShare: 2/3.0,
        });
        let claimedAmounts = [0.0, 0.0, 0.0];
        let totalDonations = 0.0;
        let teamPayout = 0.0;
        payoutFor = (i) => {
            let total = (totalDonations + teamPayout)/team.length - claimedAmounts[i];
            claimedAmounts[i] += total;
            return parseFloat(util.toWei(web3,
                total,
                "ether"
            ));
        };

        await web3.eth.sendTransaction({
            from: addresses[7],
            to: FeeManager.options.address,
            value: util.toWei(web3, 3, "ether")
        });
        totalDonations += 3.0;

        await claimMyTeamFees({
            FeeManager: FeeManager,
            team: [team[0]],
            expectedPayout: payoutFor(0)
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: util.toWei(web3, 10, "ether"),
            expectedTeamPayout: util.toWei(web3, 10/3.0, "ether")
        });
        teamPayout += 10/3.0;

        await claimMyTeamFees({
            FeeManager: FeeManager,
            team: [team[1]],
            expectedPayout: payoutFor(1)
        });

        await distributeFees({
            recipient: recipient,
            FeeManager: FeeManager,
            contractAddress: contractAddress,
            expectedPayout: util.toWei(web3, 10*2/3.0, "ether")
        });

        await web3.eth.sendTransaction({
            from: addresses[7],
            to: FeeManager.options.address,
            value: util.toWei(web3, 1, "ether")
        });
        totalDonations += 1;

        await claimMyTeamFees({
            FeeManager: FeeManager,
            team: [team[0]],
            expectedPayout: payoutFor(0)
        });

        await claimMyTeamFees({
            FeeManager: FeeManager,
            team: [team[1]],
            expectedPayout: payoutFor(1)
        });

        await claimMyTeamFees({
            FeeManager: FeeManager,
            team: [team[2]],
            expectedPayout: payoutFor(2)
        });
    });

    describe("token donations", () => {
        let TestToken;
        let FeeManager;
        let blacklisted;
        let memberA;
        let memberB;

        beforeEach(async () => {
            let tokenHolder = addresses[1];
            blacklisted = addresses[2];
            memberA = addresses[3];
            memberB = addresses[4];

            TestToken = await util.deployContract(
                web3,
                "TestToken",
                tokenHolder,
                [blacklisted]
            );
            FeeManager = await createFees({
                team: [blacklisted, memberB, memberA],
                contractAddress: addresses[5],
                creatorFeesPerEther: util.toWei(web3, .01, "ether"),
                recipient: creator,
                expectedRecipientShare: 2/3.0,
            });

            await util.methodWithGas(
                TestToken.methods.transfer(
                    FeeManager.options.address,
                    60
                ),
                tokenHolder
            );
        });

        it("claimMyTeamTokens()", async () => {
            await util.tokenBalanceEquals(TestToken, FeeManager.options.address, 60);
            await util.expectVMException(
                util.methodWithGas(
                    FeeManager.methods.claimMyTeamTokens(TestToken.options.address),
                    creator
                )
            );
            await util.tokenBalanceEquals(TestToken, FeeManager.options.address, 60);
            await util.methodWithGas(
                FeeManager.methods.claimMyTeamTokens(TestToken.options.address),
                memberA
            );
            await util.tokenBalanceEquals(TestToken, FeeManager.options.address, 40);
            await util.methodWithGas(
                FeeManager.methods.claimMyTeamTokens(TestToken.options.address),
                blacklisted
            );
            await util.tokenBalanceEquals(TestToken, FeeManager.options.address, 40);
            await util.methodWithGas(
                FeeManager.methods.claimMyTeamTokens(TestToken.options.address),
                memberB
            );
            await util.tokenBalanceEquals(TestToken, FeeManager.options.address, 20);
            await util.methodWithGas(
                FeeManager.methods.claimMyTeamTokens(TestToken.options.address),
                memberA
            );
            await util.tokenBalanceEquals(TestToken, FeeManager.options.address, 20);
            await util.tokenBalanceEquals(TestToken, memberA, 20);
            await util.tokenBalanceEquals(TestToken, memberB, 20);
            await util.tokenBalanceEquals(TestToken, blacklisted, 0);
        });

        it("distributeTeamTokens()", async () => {
            await util.tokenBalanceEquals(TestToken, FeeManager.options.address, 60);
            await util.expectVMException(
                util.methodWithGas(
                    FeeManager.methods.distributeTeamTokens(TestToken.options.address),
                    creator
                )
            );
            await util.methodWithGas(
                FeeManager.methods.distributeTeamTokens(TestToken.options.address),
                memberA
            );
            await util.methodWithGas(
                FeeManager.methods.distributeTeamTokens(TestToken.options.address),
                memberB
            );
            await util.tokenBalanceEquals(TestToken, FeeManager.options.address, 20);
            await util.tokenBalanceEquals(TestToken, memberA, 20);
            await util.tokenBalanceEquals(TestToken, memberB, 20);
            await util.tokenBalanceEquals(TestToken, blacklisted, 0);
        });
    });

});

