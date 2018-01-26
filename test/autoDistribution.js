const chai = require('chai');

const server = require('./server');
const util = require('./util');
const BigNumber = util.BigNumber;

const expect = chai.expect;

describe('autoDistribute', () => {
	let creator;
	let addresses;
	let buyer1;
	let buyer2;
	let buyer3;
	let buyer4;
	let buyer5;
	let buyer6;
	let gasFeeRecipient;
	let web3;
	let PBFeeManager;
	let tokenHolder;
	let blacklistedByToken;
	let PresalePoolLib;
	const poolFee = 0.005;

	before(async () => {
		let result = await server.setUp({total_accounts: 11});
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
		tokenHolder = result.addresses[9];
		blacklistedByToken = result.addresses[10];
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
				util.toWei(web3, poolFee, "ether"),
				util.toWei(web3, 0.01, "ether")
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
				minContribution: util.toWei(web3, 10, "ether"),
				maxContribution: util.toWei(web3, 50, "ether"),
				maxPoolBalance: util.toWei(web3, 50, "ether"),
				totalTokenDrops: 10
			}),
			0,
			{ 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
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
					minContribution: util.toWei(web3, 10, "ether"),
					maxContribution: util.toWei(web3, 50, "ether"),
					maxPoolBalance: util.toWei(web3, 50, "ether"),
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
				minContribution: util.toWei(web3, 10, "ether"),
				maxContribution: util.toWei(web3, 50, "ether"),
				maxPoolBalance: util.toWei(web3, 50, "ether"),
			}),
			0,
			{ 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
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
				minContribution: util.toWei(web3, 10, "ether"),
				maxContribution: util.toWei(web3, 50, "ether"),
				maxPoolBalance: util.toWei(web3, 50, "ether"),
			}),
			0,
			{ 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
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
				minContribution: util.toWei(web3, 1, "ether"),
				maxContribution: util.toWei(web3, 50, "ether"),
				maxPoolBalance: util.toWei(web3, 50, "ether"),
			}),
			0,
			{ 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
		);

		await util.methodWithGas(
			PresalePool.methods.deposit(),
			creator,
			util.toWei(web3, 5, "ether")
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
				minContribution: util.toWei(web3, 1, "ether"),
				maxContribution: util.toWei(web3, 50, "ether"),
				maxPoolBalance: util.toWei(web3, 50, "ether"),
			}),
			0,
			{ 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
		);

		await util.methodWithGas(
			PresalePool.methods.deposit(),
			creator,
			util.toWei(web3, 5, "ether")
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
					maxContribution: util.toWei(web3, 50, "ether"),
					maxPoolBalance: util.toWei(web3, 50, "ether"),
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
				maxContribution: util.toWei(web3, 50, "ether"),
				maxPoolBalance: util.toWei(web3, 50, "ether"),
				totalTokenDrops: 1
			}),
			0,
			{ 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
		);

		await util.expectVMException(
			util.methodWithGas(
				PresalePool.methods.setContributionSettings(
					1.9999*gasCost,
					util.toWei(web3, 50, "ether"),
					util.toWei(web3, 50, "ether"),
					[]
				),
				creator
			)
		);

		await util.methodWithGas(
			PresalePool.methods.setContributionSettings(
				2.0001*gasCost,
				util.toWei(web3, 50, "ether"),
				util.toWei(web3, 50, "ether"),
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
				util.toWei(web3, 50, "ether"),
				util.toWei(web3, 50, "ether"),
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
				util.toWei(web3, 50, "ether"),
				util.toWei(web3, 50, "ether"),
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
					minContribution: util.toWei(web3, 1, "ether"),
					feeManager: PBFeeManager.options.address,
					maxContribution: util.toWei(web3, 50, "ether"),
					maxPoolBalance: util.toWei(web3, 50, "ether"),
					totalTokenDrops: totalTokenDrops,
					autoDistributionWallet: gasFeeRecipient
				}),
				0,
				{ 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
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
				util.toWei(web3, 5, "ether")
			);
			await util.methodWithGas(
				PresalePool.methods.deposit(),
				buyer2,
				util.toWei(web3, 3, "ether")
			);

			await util.methodWithGas(
				PresalePool.methods.modifyWhitelist([], [buyer1, buyer2]),
				creator
			);

			let expectedBalances = {};
			expectedBalances[buyer1] = {
				remaining: util.toWei(web3, 5, "ether"),
				contribution: util.toWei(web3, 0, "ether"),
				whitelisted: false
			}
			expectedBalances[buyer2] = {
				remaining: util.toWei(web3, 3, "ether"),
				contribution: util.toWei(web3, 0, "ether"),
				whitelisted: false
			}
			await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 8, "ether"));


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
				util.toWei(web3, 5, "ether")
			);
			await util.methodWithGas(
				PresalePool.methods.deposit(),
				buyer2,
				util.toWei(web3, 3, "ether")
			);
			await util.methodWithGas(
				PresalePool.methods.deposit(),
				buyer3,
				util.toWei(web3, 6, "ether")
			);
			await util.methodWithGas(
				PresalePool.methods.deposit(),
				buyer4,
				util.toWei(web3, 7, "ether")
			);
			await util.methodWithGas(
				PresalePool.methods.deposit(),
				buyer5,
				util.toWei(web3, 8, "ether")
			);
			await util.methodWithGas(
				PresalePool.methods.deposit(),
				buyer6,
				util.toWei(web3, 9, "ether")
			);

			let expectedBalances = {};
			expectedBalances[buyer1] = {
				remaining: util.toWei(web3, 0, "ether"),
				contribution: util.toWei(web3, 5, "ether"),
			};
			expectedBalances[buyer2] = {
				remaining: util.toWei(web3, 0, "ether"),
				contribution: util.toWei(web3, 3, "ether"),
			};
			expectedBalances[buyer3] = {
				remaining: util.toWei(web3, 0, "ether"),
				contribution: util.toWei(web3, 6, "ether"),
			};
			expectedBalances[buyer4] = {
				remaining: util.toWei(web3, 0, "ether"),
				contribution: util.toWei(web3, 7, "ether"),
			};
			expectedBalances[buyer5] = {
				remaining: util.toWei(web3, 0, "ether"),
				contribution: util.toWei(web3, 8, "ether"),
			};
			expectedBalances[buyer6] = {
				remaining: util.toWei(web3, 0, "ether"),
				contribution: util.toWei(web3, 9, "ether"),
			};
			await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 38, "ether"));

			await util.methodWithGas(
				PresalePool.methods.modifyWhitelist([], [buyer2, buyer4]),
				creator
			);
			expectedBalances[buyer2].whitelisted = false;
			expectedBalances[buyer2].contribution = util.toWei(web3, 0, "ether");
			expectedBalances[buyer2].remaining = util.toWei(web3, 3, "ether");
			expectedBalances[buyer4].whitelisted = false;
			expectedBalances[buyer4].contribution = util.toWei(web3, 0, "ether");
			expectedBalances[buyer4].remaining = util.toWei(web3, 7, "ether");
			await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 38, "ether"));

			await util.methodWithGas(
				PresalePool.methods.setContributionSettings(
					util.toWei(web3, 5, "ether"),
					util.toWei(web3, 50, "ether"),
					util.toWei(web3, 50, "ether"),
					[]
				),
				creator
			);
			await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 38, "ether"));

			await util.methodWithGas(
				PresalePool.methods.modifyWhitelist([buyer2], []),
				creator
			);
			expectedBalances[buyer2].whitelisted = true;
			await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 38, "ether"));

			expectedBalances[buyer5].contribution = '0';
			expectedBalances[buyer6].contribution = '0';
			await util.methodWithGas(
				PresalePool.methods.withdrawAll(),
				buyer5
			);
			await util.methodWithGas(
				PresalePool.methods.withdraw(util.toWei(web3, 9, "ether")),
				buyer6
			);
			await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 21, "ether"));
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

	describe("transferAutoDistributionTokens", () => {
		let PresalePool;
		let TestToken;
		const totalTokenDrops = 1;
		beforeEach(async () => {
			PresalePool = await util.deployContract(
				web3,
				"PresalePool",
				creator,
				util.createPoolArgs({
					minContribution: util.toWei(web3, 0.5, "ether"),
					feeManager: PBFeeManager.options.address,
					maxContribution: util.toWei(web3, 50, "ether"),
					maxPoolBalance: util.toWei(web3, 50, "ether"),
					totalTokenDrops: totalTokenDrops,
					autoDistributionWallet: gasFeeRecipient
				}),
				0,
				{ 'PoolLib.sol:PoolLib': PresalePoolLib.options.address }
			);

			TestToken = await util.deployContract(
				web3,
				"TestToken",
				creator,
				[blacklistedByToken]
			);
		});

		it("transferTokensToAll()", async () => {
			await util.methodWithGas(
				PresalePool.methods.deposit(),
				buyer1,
				util.toWei(web3, 1, "ether")
			);
			await util.methodWithGas(
				PresalePool.methods.deposit(),
				buyer2,
				util.toWei(web3, 1.5, "ether")
			);
			await util.methodWithGas(
				PresalePool.methods.deposit(),
				buyer3,
				util.toWei(web3, 0.5, "ether")
			);

			// Pay to presale
			let gasCost = util.distributionGasCosts({ numContributors: 3, numDrops: totalTokenDrops });
			await util.expectBalanceChange(web3, gasFeeRecipient, gasCost, () => {
				return util.methodWithGas(
					PresalePool.methods.payToPresale(creator, 0, 0, '0x'),
					creator
				)
			});

			let expectedBalances = {};
			expectedBalances[buyer1] = {
				remaining: util.toWei(web3, 0, "ether"),
				contribution: util.toWei(web3, 1, "ether")
			};
			expectedBalances[buyer2] = {
				remaining: util.toWei(web3, 0, "ether"),
				contribution: util.toWei(web3, 1.5, "ether")
			};
			expectedBalances[buyer3] = {
				remaining: util.toWei(web3, 0, "ether"),
				contribution: util.toWei(web3, 0.5, "ether")
			};

			// Verify that the pool contribution balance and contract balance is right
			await util.verifyState(web3, PresalePool, expectedBalances, util.toWei(web3, 3*poolFee, "ether"));

			// Send tokens to pool
			let NumTokensNotFormatted = new BigNumber("1000").mul(new BigNumber("10").pow(new BigNumber("18")));
			await util.methodWithGas(
				TestToken.methods.transfer(
					PresalePool.options.address,
					NumTokensNotFormatted.toString(10)
				),
				creator
			);

			// Contract should have 1000
			expect(await TestToken.methods.balanceOf(PresalePool.options.address).call())
				.to.equal(NumTokensNotFormatted.toString(10));

			// Confirm the tokens
			await util.methodWithGas(
				PresalePool.methods.confirmTokens(TestToken.options.address, true),
				creator
			);

			await util.methodWithGas(
				PresalePool.methods.transferTokensTo(
					TestToken.options.address,
					[buyer1, buyer2, buyer3]),
				creator
			);

			const poolBalanceInWei = new BigNumber(util.toWei(web3, 3, 'ether').toString());
			const gasCostPerContributor = new BigNumber(util.distributionGasCosts({ numContributors: 1, numDrops: totalTokenDrops }).toString());

			const buyer1TokenShare = util.getTokenShare(
				new BigNumber(util.toWei(web3, 1, 'ether')),
				poolBalanceInWei,
				poolFee,
				gasCostPerContributor,
				3,
				NumTokensNotFormatted
			);
			const buyer2TokenShare = util.getTokenShare(
				new BigNumber(util.toWei(web3, 1.5, 'ether')),
				poolBalanceInWei,
				poolFee,
				gasCostPerContributor,
				3,
				NumTokensNotFormatted
			);
			const buyer3TokenShare = util.getTokenShare(
				new BigNumber(util.toWei(web3, 0.5, 'ether')),
				poolBalanceInWei,
				poolFee,
				gasCostPerContributor,
				3,
				NumTokensNotFormatted
			);

			await util.tokenBalanceEquals(TestToken, buyer1, buyer1TokenShare);
			await util.tokenBalanceEquals(TestToken, buyer2, buyer2TokenShare);
			await util.tokenBalanceEquals(TestToken, buyer3, buyer3TokenShare);
		});
	});
});

