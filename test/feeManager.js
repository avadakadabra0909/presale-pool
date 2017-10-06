const chai = require('chai');

const server = require('./server');
const util = require('./util');

const expect = chai.expect;

describe('PPFeeManager', () => {
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

        let beforeBalance = await FeeManager.methods.teamTotalBalance().call();

        await web3.eth.sendTransaction({
            from: contractAddress,
            to: FeeManager.options.address,
            value: amount,
            gas: 1000000
        });

        let afterBalance = await FeeManager.methods.teamTotalBalance().call();
        let difference = parseInt(afterBalance) - parseInt(beforeBalance);
        expect(difference / expectedTeamPayout).to.be.within(.98, 1.0);
    }

    async function claimMyFees(options) {
        let {
            contractAddress,
            recipients,
            FeeManager,
            expectedPayout
        } = options;

        for (let i = 0; i < recipients.length; i++ ) {
            let recipient = recipients[i];
            await util.expectBalanceChange(web3, recipient, expectedPayout, ()=> {
                return util.methodWithGas(
                    FeeManager.methods.claimMyFees(contractAddress),
                    recipient
                );
            });
        }
    }

    async function distrbuteFees(options) {
        let {
            contractAddress,
            recipients,
            FeeManager,
            expectedPayout
        } = options;

        await util.expectBalanceChangeAddresses(web3, recipients, expectedPayout, ()=>{
            return util.methodWithGas(
                FeeManager.methods.distrbuteFees(recipients),
                contractAddress
            );
        });
    }

    async function createFees(options) {
        let {
            team,
            contractAddress,
            recipients,
            feesPerEther,
            expectedRecipientShare,
        } = options;

        let FeeManager = await util.deployContract(
            web3,
            "PPFeeManager",
            creator,
            [team]
        );

        await util.methodWithGas(
            FeeManager.methods.create(
                feesPerEther,
                recipients
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
                "PPFeeManager",
                creator,
                [[]]
            )
        );
    });

    it('handles duplicate team members', async () => {
        let team = [creator, creator, addresses[1], creator];
        let FeeManager = await util.deployContract(
            web3,
            "PPFeeManager",
            creator,
            [team]
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
            "PPFeeManager",
            creator,
            [team]
        );
        let recipients = [creator];

        await util.expectVMException(
            util.methodWithGas(
                FeeManager.methods.create(
                    web3.utils.toWei(0.5, "ether"),
                    recipients
                ),
                creator
            )
        );

        await util.expectVMException(
            util.methodWithGas(
                FeeManager.methods.create(
                    web3.utils.toWei(1.5, "ether"),
                    recipients
                ),
                creator
            )
        );

        await util.methodWithGas(
            FeeManager.methods.create(
                web3.utils.toWei(0.49, "ether"),
                recipients
            ),
            creator
        );
    });

    it('must have at least one fee recipient', async () => {
        let team = [creator];
        let FeeManager = await util.deployContract(
            web3,
            "PPFeeManager",
            creator,
            [team]
        );
        let recipients = [creator];

        await util.expectVMException(
            util.methodWithGas(
                FeeManager.methods.create(
                    web3.utils.toWei(0.1, "ether"),
                    []
                ),
                creator
            )
        );
    });

    it('must have less than 5 recipients', async () => {
        let team = [creator];
        let FeeManager = await util.deployContract(
            web3,
            "PPFeeManager",
            creator,
            [team]
        );

        let recipients = [
            addresses[0],
            addresses[1],
            addresses[2],
            addresses[3],
        ];
        await util.methodWithGas(
            FeeManager.methods.create(
                web3.utils.toWei(0.1, "ether"),
                recipients
            ),
            creator
        );

        recipients.push(addresses[4]);
        await util.expectVMException(
            util.methodWithGas(
                FeeManager.methods.create(
                    web3.utils.toWei(0.1, "ether"),
                    recipients
                ),
                creator
            )
        );
    });

    it('can only create fee structure once', async () => {
        let team = [creator];
        let FeeManager = await util.deployContract(
            web3,
            "PPFeeManager",
            creator,
            [team]
        );
        let recipients = [creator];

        await util.methodWithGas(
            FeeManager.methods.create(
                web3.utils.toWei(0.1, "ether"),
                recipients
            ),
            creator
        );

        await util.expectVMException(
            util.methodWithGas(
                FeeManager.methods.create(
                    web3.utils.toWei(0.1, "ether"),
                    recipients
                ),
                creator
            )
        );
    });

    it('cant include duplicate fee recipients', async () => {
        let team = [creator];
        let FeeManager = await util.deployContract(
            web3,
            "PPFeeManager",
            creator,
            [team]
        );
        let recipients = [creator, addresses[3], creator];

        await util.expectVMException(
            util.methodWithGas(
                FeeManager.methods.create(
                    web3.utils.toWei(0.1, "ether"),
                    recipients
                ),
                creator
            )
        );
    });

    it('splits fee to 50-50 when there is only one recipient - claim fees', async () => {
        let team = [creator];
        let contractAddress = addresses[1];
        let recipients = [addresses[2]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPerEther: web3.utils.toWei(.01, "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.5,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei(2, "ether"),
            expectedTeamPayout: web3.utils.toWei(1, "ether")
        });

        await claimMyFees({
            recipients: recipients,
            FeeManager: FeeManager,
            contractAddress: contractAddress,
            expectedPayout: web3.utils.toWei(1, "ether")
        });

        await util.expectVMException(
            claimMyFees({
                recipients: recipients,
                FeeManager: FeeManager,
                contractAddress: contractAddress,
                expectedPayout: web3.utils.toWei(1, "ether")
            })
        );

        await distrbuteFees({
            recipients: recipients,
            FeeManager: FeeManager,
            contractAddress: contractAddress,
            expectedPayout: web3.utils.toWei(0, "ether")
        });
    });

    it('splits fee to 50-50 when there is only one recipient - distribute fees', async () => {
        let team = [creator];
        let contractAddress = addresses[1];
        let recipients = [addresses[2]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPerEther: web3.utils.toWei(.01, "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.5,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei(2, "ether"),
            expectedTeamPayout: web3.utils.toWei(1, "ether")
        });

        await distrbuteFees({
            recipients: recipients,
            FeeManager: FeeManager,
            contractAddress: contractAddress,
            expectedPayout: web3.utils.toWei(1, "ether")
        });

        await util.expectVMException(
            claimMyFees({
                recipients: recipients,
                FeeManager: FeeManager,
                contractAddress: contractAddress,
                expectedPayout: web3.utils.toWei(1, "ether")
            })
        );

        await distrbuteFees({
            recipients: recipients,
            FeeManager: FeeManager,
            contractAddress: contractAddress,
            expectedPayout: web3.utils.toWei(0, "ether")
        });
    });

    it('caps team fee to 1% when there is 1 recipient', async () => {
        let team = [creator];
        let contractAddress = addresses[1];
        let recipients = [addresses[2]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPerEther: web3.utils.toWei(.1, "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.9,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei(10, "ether"),
            expectedTeamPayout: web3.utils.toWei(1, "ether")
        });

        await claimMyFees({
            recipients: recipients,
            FeeManager: FeeManager,
            contractAddress: contractAddress,
            expectedPayout: web3.utils.toWei(9, "ether")
        });
    });

    it('recipients cant claim more than their share', async () => {
        let team = [creator];
        let contractAddress = addresses[1];
        let recipients = [addresses[2], addresses[3], addresses[4]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPerEther: web3.utils.toWei(.01, "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.25,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei(10, "ether"),
            expectedTeamPayout: web3.utils.toWei(2.5, "ether")
        });

        for (let i = 0; i < recipients.length; i++) {
            await claimMyFees({
                recipients: [recipients[i]],
                FeeManager: FeeManager,
                contractAddress: contractAddress,
                expectedPayout: web3.utils.toWei(2.5, "ether")
            });

            await util.expectVMException(
                claimMyFees({
                    recipients: [recipients[i]],
                    FeeManager: FeeManager,
                    contractAddress: contractAddress,
                    expectedPayout: web3.utils.toWei(0, "ether")
                })
            );
        }
    });

    it('recipient share of fee is 25% when there are 3 recipients - claim fees', async () => {
        let team = [creator];
        let contractAddress = addresses[1];
        let recipients = [addresses[2], addresses[3], addresses[4]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPerEther: web3.utils.toWei(.01, "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.25,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei(10, "ether"),
            expectedTeamPayout: web3.utils.toWei(2.5, "ether")
        });

        await claimMyFees({
            recipients: recipients,
            FeeManager: FeeManager,
            contractAddress: contractAddress,
            expectedPayout: web3.utils.toWei(2.5, "ether")
        });

        await util.expectVMException(
            claimMyFees({
                recipients: [recipients[1]],
                FeeManager: FeeManager,
                contractAddress: contractAddress,
                expectedPayout: web3.utils.toWei(0, "ether")
            })
        );

        await distrbuteFees({
            recipients: recipients,
            FeeManager: FeeManager,
            contractAddress: contractAddress,
            expectedPayout: web3.utils.toWei(0, "ether")
        });
    });

    it('recipient share of fee is 25% when there are 3 recipients - distribute fees', async () => {
        let team = [creator];
        let contractAddress = addresses[1];
        let recipients = [addresses[2], addresses[3], addresses[4]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPerEther: web3.utils.toWei(.01, "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.25,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei(10, "ether"),
            expectedTeamPayout: web3.utils.toWei(2.5, "ether")
        });

        await distrbuteFees({
            recipients: recipients,
            FeeManager: FeeManager,
            contractAddress: contractAddress,
            expectedPayout: web3.utils.toWei(2.5, "ether")
        });

        await util.expectVMException(
            claimMyFees({
                recipients: [recipients[1]],
                FeeManager: FeeManager,
                contractAddress: contractAddress,
                expectedPayout: web3.utils.toWei(0, "ether")
            })
        );

        await distrbuteFees({
            recipients: recipients,
            FeeManager: FeeManager,
            contractAddress: contractAddress,
            expectedPayout: web3.utils.toWei(0, "ether")
        });
    });

    it('caps team fee to 1% when there is more than 1 recipient', async () => {
        let team = [creator];
        let contractAddress = addresses[1];
        let recipients = [addresses[2], addresses[3], addresses[4]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPerEther: web3.utils.toWei(.1, "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.3,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei(10, "ether"),
            expectedTeamPayout: web3.utils.toWei(1, "ether")
        });

        await distrbuteFees({
            recipients: recipients,
            FeeManager: FeeManager,
            contractAddress: contractAddress,
            expectedPayout: web3.utils.toWei(3, "ether")
        });
    });

    it('claimMyTeamFees can only be called by team member', async () => {
        let team = [addresses[1]];
        let FeeManager = await util.deployContract(
            web3,
            "PPFeeManager",
            creator,
            [team],
            web3.utils.toWei(3, "ether")
        );

        await util.expectVMException(
            util.methodWithGas(
                FeeManager.methods.claimMyTeamFees(),
                addresses[2],
            )
        );
    });

    it('distributeTeamFees can only be called by team member', async () => {
        let team = [addresses[1]];
        let FeeManager = await util.deployContract(
            web3,
            "PPFeeManager",
            creator,
            [team],
            web3.utils.toWei(3, "ether")
        );

        await util.expectVMException(
            util.methodWithGas(
                FeeManager.methods.distributeTeamFees(),
                addresses[2],
            )
        );
    });

    it('claimMyTeamFees with 1 team member', async () => {
        let team = [addresses[1]];
        let contractAddress = addresses[2];
        let recipients = [addresses[3], addresses[4], addresses[5]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPerEther: web3.utils.toWei(.01, "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.25,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei(10, "ether"),
            expectedTeamPayout: web3.utils.toWei(2.5, "ether")
        });

        await claimMyTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: web3.utils.toWei(2.5, "ether")
        });

        await distributeTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: web3.utils.toWei(0, "ether")
        });

        await claimMyTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: web3.utils.toWei(0, "ether")
        });
    });

    it('distributeTeamFees with 1 team member', async () => {
        let team = [addresses[1]];
        let contractAddress = addresses[2];
        let recipients = [addresses[3], addresses[4], addresses[5]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPerEther: web3.utils.toWei(.01, "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.25,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei(10, "ether"),
            expectedTeamPayout: web3.utils.toWei(2.5, "ether")
        });

        await distributeTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: web3.utils.toWei(2.5, "ether")
        });

        await claimMyTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: web3.utils.toWei(0, "ether")
        });

        await distributeTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: web3.utils.toWei(0, "ether")
        });
    });

    it('team members cant claim more than their share', async () => {
        let team = [addresses[1], addresses[2], addresses[3]];
        let contractAddress = addresses[4];
        let recipients = [addresses[5], addresses[6], addresses[7]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPerEther: web3.utils.toWei(.01, "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.25,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei(10, "ether"),
            expectedTeamPayout: web3.utils.toWei(2.5, "ether")
        });

        for (let i = 0; i < team.length; i++) {
            await claimMyTeamFees({
                FeeManager: FeeManager,
                team: [team[i]],
                expectedPayout: web3.utils.toWei(2.5/3, "ether")
            });
            await claimMyTeamFees({
                FeeManager: FeeManager,
                team: [team[i]],
                expectedPayout: web3.utils.toWei(0, "ether")
            });
        }
    });

    it('claimMyTeamFees with more than 1 team member', async () => {
        let team = [addresses[1], addresses[2], addresses[3]];
        let contractAddress = addresses[4];
        let recipients = [addresses[5], addresses[6], addresses[7]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPerEther: web3.utils.toWei(.01, "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.25,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei(10, "ether"),
            expectedTeamPayout: web3.utils.toWei(2.5, "ether")
        });

        await claimMyTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: web3.utils.toWei(2.5/3, "ether")
        });

        await distributeTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: web3.utils.toWei(0, "ether")
        });

        await claimMyTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: web3.utils.toWei(0, "ether")
        });
    });

    it('distributeTeamFees with more than 1 team member', async () => {
        let team = [addresses[1], addresses[2]];
        let contractAddress = addresses[4];
        let recipients = [addresses[5], addresses[6], addresses[7]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPerEther: web3.utils.toWei(.01, "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.25,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei(10, "ether"),
            expectedTeamPayout: web3.utils.toWei(2.5, "ether")
        });

        await distributeTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: web3.utils.toWei(2.5/2, "ether")
        });
    });
});

