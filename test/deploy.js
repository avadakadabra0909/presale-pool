const chai = require('chai');

const server = require('./server');
const util = require('./util');

const expect = chai.expect;

describe('deploy', () => {
    let creator;
    let addresses;
    let web3;
    let PBFeeManager;
    let PresalePoolLib;

    before(async () => {
        let result = await server.setUp();
        web3 = result.web3;
        creator = result.addresses[0].toLowerCase();
        addresses = result.addresses;
        let feeTeamMember = addresses[addresses.length-1].toLowerCase();
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
                util.toWei(web3, "0.005", "ether"),
                util.toWei(web3, "0.01", "ether")
            ]
        );
    });

    after(async () => {
        await server.tearDown();
    });

    it('can be deployed with multiple admins', async () => {
        let admins = [addresses[1].toLowerCase(), addresses[2].toLowerCase()];
        let nonAdmin = addresses[3].toLowerCase();
        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                feeManager: PBFeeManager.options.address,
                admins: admins,
                minContribution: 0,
                maxContribution: util.toWei(web3, "50", "ether"),
                maxPoolBalance: util.toWei(web3, "50", "ether"),
            }),
            0,
            { 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
        );
        let poolBalance = await web3.eth.getBalance(
            PresalePool.options.address
        );

        await util.methodWithGas(PresalePool.methods.setContributionSettings(0, 0, 0, []), creator);
        await util.methodWithGas(PresalePool.methods.setContributionSettings(0, 0, 0, []), admins[0]);
        await util.methodWithGas(PresalePool.methods.setContributionSettings(0, 0, 0, []), admins[1]);

        await util.expectVMException(
            util.methodWithGas(PresalePool.methods.setContributionSettings(0, 0, 0, []), nonAdmin)
        );
    });

    it('can be deployed with whitelisting enabled', async () => {
        let admins = [addresses[1], addresses[2]];
        let buyer1 = addresses[3];
        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                feeManager: PBFeeManager.options.address,
                admins: admins,
                restricted: true,
                minContribution: 0,
                maxContribution: util.toWei(web3, "50", "ether"),
                maxPoolBalance: util.toWei(web3, "50", "ether"),
            }),
            0,
            { 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer1,
                util.toWei(web3, "3", "ether")
            )
        );

        admins.push(creator);
        for (let i = 0; i < admins.length; i++) {
            await util.methodWithGas(
                PresalePool.methods.deposit(),
                admins[i],
                util.toWei(web3, "3", "ether")
            );
        }
    });

    it('can be deployed without balance', async () => {
        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                feeManager: PBFeeManager.options.address,
                minContribution: 0,
                maxContribution: util.toWei(web3, "50", "ether"),
                maxPoolBalance: util.toWei(web3, "50", "ether"),
            }),
            0,
            { 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
        );
        let poolBalance = await web3.eth.getBalance(
            PresalePool.options.address
        );
        expect(poolBalance).to.equal(util.toWei(web3, "0", "ether"));
        let balances = await util.getBalances(PresalePool);
        let filtered = {};
        Object.keys(balances).forEach((addr) => {
            if (parseInt(balances[addr].contribution) > 0) {
                filtered[addr] = balances[addr];
            }
        });
        expect(filtered).to.deep.equal({});
    });

    it('cant be deployed with balance', async () => {
        await util.expectVMException(
            util.deployContract(
                web3, "PresalePool",
                creator,
                util.createPoolArgs({
                    feeManager: PBFeeManager.options.address,
                    minContribution: 0,
                    maxContribution: util.toWei(web3, "50", "ether"),
                    maxPoolBalance: util.toWei(web3, "50", "ether"),
                }),
                util.toWei(web3, 5, "ether"),
                { 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
            )
        );
    });

    it('validates contribution settings during deploy', async () => {
        await util.expectVMException(
            util.deployContract(
                web3,
                "PresalePool",
                creator,
                util.createPoolArgs({
                    feeManager: PBFeeManager.options.address,
                    minContribution: 3,
                    maxContribution: 2,
                    maxPoolBalance: 5
                }),
                0,
                { 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
            )
        );
        await util.expectVMException(
            util.deployContract(
                web3,
                "PresalePool",
                creator,
                util.createPoolArgs({
                    feeManager: PBFeeManager.options.address,
                    minContribution: 3,
                    maxContribution: 0,
                    maxPoolBalance: 5
                }),
                0,
                { 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
            )
        );
        await util.expectVMException(
            util.deployContract(
                web3, "PresalePool",
                creator,
                util.createPoolArgs({
                    feeManager: PBFeeManager.options.address,
                    minContribution: 0,
                    maxContribution: 2,
                    maxPoolBalance: 1
                }),
                0,
                { 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
            )
        );
        await util.expectVMException(
            util.deployContract(
                web3, "PresalePool",
                creator,
                util.createPoolArgs({
                    feeManager: PBFeeManager.options.address,
                    minContribution: 3,
                    maxPoolBalance: 2,
                    maxContribution: 4
                }),
                0,
                { 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
            )
        );
    });
});

