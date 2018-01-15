pragma solidity ^0.4.15;

import "./PoolLib.sol";

contract PresalePool {
    using PoolLib for PoolLib.PoolStorage;

    PoolLib.PoolStorage private poolStorage;

    bool private locked;
    modifier noReentrancy() {
        require(!locked);
        locked = true;
        _;
        locked = false;
    }

    function PresalePool(
        address _feeManager,
        uint _creatorFeesPerEther,
        uint _minContribution,
        uint _maxContribution,
        uint _maxPoolBalance,
        address[] _admins,
        bool _restricted,
        uint _totalTokenDrops,
        address _autoDistributionWallet,
        uint256 _code
    ) {
        poolStorage.create(
            _feeManager,
            _creatorFeesPerEther,
            _minContribution,
            _maxContribution,
            _maxPoolBalance,
            _admins,
            _restricted,
            _totalTokenDrops,
            _autoDistributionWallet,
            _code
        );
    }

    function deposit() payable public {
        poolStorage.deposit();
    }

    function () external payable {
        poolStorage.refund();
    }

    function airdropEther(uint gasPrice, address autoDistributionWallet) external payable {
        poolStorage.airdropEther(gasPrice, autoDistributionWallet);
    }

    function airdropTokens(address tokenAddress, uint gasPrice, address autoDistributionWallet) external payable {
        poolStorage.airdropTokens(tokenAddress, gasPrice, autoDistributionWallet);
    }

    function tokenFallback(address _from, uint _value, bytes _data) external {
        poolStorage.tokenFallback(_from, _value, _data);
    }

    function version() external returns (uint, uint, uint) {
        return PoolLib.version();
    }

    function fail() external {
        poolStorage.fail();
    }

    function discountFees(uint recipientFeesPerEther, uint teamFeesPerEther) external {
        poolStorage.discountFees(recipientFeesPerEther, teamFeesPerEther);
    }

    function payToPresale(address _presaleAddress, uint minPoolBalance, uint gasLimit, bytes data) external {
        poolStorage.payToPresale(
            _presaleAddress,
            minPoolBalance,
            gasLimit,
            data
        );
    }

    function forwardTransaction(address destination, uint gasLimit, bytes data) external {
        poolStorage.forwardTransaction(
            destination,
            gasLimit,
            data
        );
    }

    function expectRefund(address sender) external {
        poolStorage.expectRefund(sender);
    }

    function transferFees() public returns(uint) {
        poolStorage.transferFees();
    }

    function transferAndDistributeFees() public {
        poolStorage.transferAndDistributeFees();
    }

    function confirmTokens(address tokenAddress, bool claimFees) external {
        poolStorage.confirmTokens(tokenAddress, claimFees);
    }

    function withdrawAll() external {
        poolStorage.withdrawAll();
    }

    function withdrawAllForMany(address[] recipients) external {
        poolStorage.withdrawAllForMany(recipients);
    }

    function withdraw(uint amount) external {
        poolStorage.withdraw(amount);
    }

    function transferTokensToAll(address tokenAddress) external noReentrancy {
        poolStorage.transferTokensToAll(tokenAddress);
    }

    function transferTokensTo(address tokenAddress, address[] recipients) external noReentrancy {
        poolStorage.transferTokensTo(tokenAddress, recipients);
    }

    function modifyWhitelist(address[] toInclude, address[] toExclude) external {
        poolStorage.modifyWhitelist(toInclude, toExclude);
    }

    function removeWhitelist() external {
        poolStorage.removeWhitelist();
    }

    function setTokenDrops(uint _totalTokenDrops) external {
        poolStorage.setTokenDrops(_totalTokenDrops);
    }

    function setContributionSettings(uint _minContribution, uint _maxContribution, uint _maxPoolBalance, address[] toRebalance) external {
        poolStorage.setContributionSettings(_minContribution, _maxContribution, _maxPoolBalance, toRebalance);
    }

    // functions just for testing

    function getParticipantBalances() external constant returns(address[], uint[], uint[], bool[], bool[]) {
        uint[] memory contribution = new uint[](poolStorage.participants.length);
        uint[] memory remaining = new uint[](poolStorage.participants.length);
        bool[] memory whitelisted = new bool[](poolStorage.participants.length);
        bool[] memory exists = new bool[](poolStorage.participants.length);

        for (uint i = 0; i < poolStorage.participants.length; i++) {
            PoolLib.ParticipantState storage balance = poolStorage.balances[poolStorage.participants[i]];
            contribution[i] = balance.contribution;
            remaining[i] = balance.remaining;
            whitelisted[i] = balance.whitelisted;
            exists[i] = balance.exists;
        }

        return (poolStorage.participants, contribution, remaining, whitelisted, exists);
    }

    function poolContributionBalance() external returns(uint) {
        return poolStorage.poolContributionBalance;
    }

    function totalContributors() external returns(uint) {
        return poolStorage.totalContributors;
    }

    function totalTokenDrops() external returns(uint) {
        return poolStorage.totalTokenDrops;
    }
}