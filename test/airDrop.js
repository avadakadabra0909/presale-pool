const chai = require('chai');

const server = require('./server');
const util = require('./util');
const BigNumber = util.BigNumber;

const expect = chai.expect;

describe('Air Drop', () => {
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
	let TestToken;
	let feeTeamMember;
	let PresalePoolLib;
	const poolFee = 0.005;

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
				util.toWei(web3, poolFee, "ether"),
				util.toWei(web3, 0.01, "ether")
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
				minContribution: util.toWei(web3, 1, "ether"),
				feeManager: PBFeeManager.options.address,
				maxContribution: util.toWei(web3, 50, "ether"),
				maxPoolBalance: util.toWei(web3, 50, "ether")
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
				util.toWei(web3, 11, "ether")
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
				util.toWei(web3, 11, "ether")
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
				util.toWei(web3, 11, "ether")
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
				util.toWei(web3, 11, "ether")
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
					util.toWei(web3, 5, "gwei"),
					gasFeeRecipient
				),
				buyer6,
				gasCosts
			)
		);

		await util.expectBalanceChange(web3, gasFeeRecipient, gasCosts, () => {
			return util.methodWithGas(
				PresalePool.methods.airdropEther(
					util.toWei(web3, 5, "gwei"),
					gasFeeRecipient
				),
				buyer6,
				gasCosts + parseInt(util.toWei(web3, 11, "ether"))
			)
		});

		let test = [0, 3, 0, 7, 0, 0].map(x => util.toWei(web3, x, "ether"));
		await util.expectBalanceChanges(
			web3,
			[buyer1, buyer2, buyer3, buyer4, buyer5, buyer6],
			[0, 3, 0, 7, 0, 0].map(x => util.toWei(web3, x, "ether")),
			() => {
				return util.methodWithGas(
					PresalePool.methods.transferTokensToAll(
						TestToken.options.address
					),
					creator
				);
			}
		);

		await util.expectBalanceChanges(
			web3,
			[buyer1, buyer2, buyer3, buyer4, buyer5, buyer6],
			[5, 0, 6, 0, 0, 0].map(x => util.toWei(web3, x, "ether")),
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
					util.toWei(web3, 5, "gwei"),
					gasFeeRecipient
				),
				creator,
				util.toWei(web3, 11, "ether")
			)
		});

		await util.expectBalanceChanges(
			web3,
			[buyer1, buyer2, buyer3, buyer4, buyer5, buyer6],
			[0, 3, 0, 7, 0, 0].map(x => util.toWei(web3, x, "ether")),
			() => {
				return util.methodWithGas(
					PresalePool.methods.transferTokensToAll(
						TestToken.options.address
					),
					creator
				);
			}
		);

		await util.expectBalanceChanges(
			web3,
			[buyer1, buyer2, buyer3, buyer4, buyer5, buyer6],
			[5, 0, 6, 0, 0, 0].map(x => util.toWei(web3, x, "ether")),
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

	it('tokens with auto distribution', async () => {
		// Pay to token contract and get 1000 tokens
		let NumTestTokenNotFormatted = new BigNumber("1000").mul(new BigNumber("10").pow(new BigNumber("18")));
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

		// Send 10 OtherTestToken to pool
		let NumOtherTestTokenNotFormatted = new BigNumber("10").mul(new BigNumber("10").pow(new BigNumber("18")));
		await util.methodWithGas(
			OtherTestToken.methods.transfer(
				PresalePool.options.address,
				NumOtherTestTokenNotFormatted.toString(10)
			),
			creator
		);

		let gasCosts = util.distributionGasCosts({
			numContributors: 2, numDrops: 1, gasPriceGwei: 5
		});

		// not enough to cover gas costs
		await util.expectVMException(
			util.methodWithGas(
				PresalePool.methods.airdropTokens(
					OtherTestToken.options.address,
					util.toWei(web3, 5, "gwei"),
					gasFeeRecipient
				),
				buyer6,
				gasCosts*0.99
			)
		);

		// way more than needed for gas costs
		await util.expectVMException(
			util.methodWithGas(
				PresalePool.methods.airdropTokens(
					OtherTestToken.options.address,
					util.toWei(web3, 5, "gwei"),
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
					util.toWei(web3, 5, "gwei"),
					gasFeeRecipient
				),
				buyer6,
				gasCosts
			)
		});

		await util.expectBalanceChanges(
			web3,
			[buyer1, buyer2, buyer3, buyer4, buyer5, buyer6],
			[0, 3, 0, 7, 0, 0].map(x => util.toWei(web3, x, "ether")),
			() => {
				return util.methodWithGas(
					PresalePool.methods.transferTokensToAll(
						TestToken.options.address
					),
					creator
				);
			}
		);

		const poolBalanceInWei = new BigNumber(util.toWei(web3, 11, 'ether'));
		const zero = new BigNumber(0);
		const buyer1TokenShare = util.getTokenShare(
			new BigNumber(util.toWei(web3, 5, 'ether')),
			poolBalanceInWei,
			new BigNumber(util.toWei(web3, poolFee, 'ether')),
			zero,
			2,
			NumTestTokenNotFormatted
		);
		const buyer3TokenShare = util.getTokenShare(
			new BigNumber(util.toWei(web3, 6, 'ether')),
			poolBalanceInWei,
			new BigNumber(util.toWei(web3, poolFee, 'ether')),
			zero,
			2,
			NumTestTokenNotFormatted
		);

		await util.tokenBalanceEquals(TestToken, buyer1, buyer1TokenShare);
		await util.tokenBalanceEquals(TestToken, buyer2, zero);
		await util.tokenBalanceEquals(TestToken, buyer3, buyer3TokenShare);
		await util.tokenBalanceEquals(TestToken, buyer4, zero);
		await util.tokenBalanceEquals(TestToken, buyer5, zero);
		await util.tokenBalanceEquals(TestToken, buyer6, zero);


		await util.expectBalanceChanges(
			web3,
			[buyer1, buyer2, buyer3, buyer4, buyer5, buyer6],
			[0, 0, 0, 0, 0, 0].map(x => util.toWei(web3, x, "ether")),
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

		await util.tokenBalanceEquals(
			OtherTestToken,
			buyer1,
			util.getTokenShare(
				new BigNumber(util.toWei(web3, 5, 'ether')),
				poolBalanceInWei,
				poolFee,
				zero,
				2,
				NumOtherTestTokenNotFormatted
			)
		);
		await util.tokenBalanceEquals(OtherTestToken, buyer2, 0);
		await util.tokenBalanceEquals(
			OtherTestToken,
			buyer3,
			util.getTokenShare(
				new BigNumber(util.toWei(web3, 6, 'ether')),
				poolBalanceInWei,
				poolFee,
				zero,
				2,
				NumOtherTestTokenNotFormatted
			)
		);
		await util.tokenBalanceEquals(OtherTestToken, buyer4, 0);
		await util.tokenBalanceEquals(OtherTestToken, buyer5, 0);
		await util.tokenBalanceEquals(OtherTestToken, buyer6, 0);
		await util.tokenBalanceEquals(OtherTestToken, feeTeamMember, 0);
	});

});

