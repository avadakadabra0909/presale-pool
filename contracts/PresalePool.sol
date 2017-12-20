pragma solidity ^0.4.15;

import "./Util.sol";
import "./QuotaTracker.sol";

interface ERC20 {
    function transfer(address _to, uint _value) returns (bool success);
    function balanceOf(address _owner) constant returns (uint balance);
}

interface FeeManager {
    function create(uint recipientFeesPerEther, address recipient) returns(uint);
    function discountFees(uint recipientFeesPerEther, uint teamFeesPerEther);
    function sendFees() payable returns(uint);
    function distributeFees(address contractAddress);
}

contract PresalePool {
    using QuotaTracker for QuotaTracker.Data;

    enum State { Open, Failed, Paid, Refund }
    State public state;

    address[] public admins;

    uint public minContribution;
    uint public maxContribution;
    uint public maxPoolBalance;

    uint constant public MAX_POSSIBLE_AMOUNT = 1e9 ether;
    uint constant public MAX_POSSIBLE_TOKEN_DROPS = 10;
    uint constant public MAX_GAS_PRICE = 60e9;
    uint constant public AUTO_DISTRIBUTE_GAS = 150000;

    address[] public participants;

    bool public restricted;

    struct ParticipantState {
        uint contribution;
        uint remaining;
        bool whitelisted;
        bool exists;
    }
    mapping (address => ParticipantState) public balances;
    uint public poolContributionBalance;
    uint public poolRemainingBalance;
    uint public totalContributors;

    address public presaleAddress;

    address public refundSenderAddress;
    QuotaTracker.Data public extraEtherDeposits;
    mapping (address => QuotaTracker.Data) public tokenDeposits;

    address public expectedTokenAddress;

    FeeManager public feeManager;
    uint public totalFees;
    uint public feesPerEther;

    uint public totalTokenDrops;
    address public autoDistributeGasRecipient;

    event Deposit(
        address _from,
        uint _value,
        uint _contributionTotal,
        uint _poolContributionBalance
    );
    event AutoDistributionConfigured(
        uint _autoDistributeGasPrice,
        uint _totalTokenDrops,
        address _autoDistributeGasRecipient
    );
    event TransactionForwarded(
        address _destination,
        uint _gasLimit,
        bytes _data
    );
    event FeeInstalled(
        uint _totalPercentage,
        uint _creatorPercentage,
        address _feeManager
    );
    event FeesTransferred(
        uint _fees
    );
    event FeesDistributed();
    event ExpectingRefund(
        address _senderAddress
    );
    event EtherAirdropRecieved(
        address _senderAddress,
        uint _value,
        uint _gasPrice
    );
    event AutoDistributeTokenAirdrop(
        address _senderAddress,
        address _tokenAddress,
        uint _gasPrice
    );
    event RefundRecieved(
        uint _value
    );
    event ERC223TokensReceived(
        address _tokenAddress,
        address _senderAddress,
        uint _amount,
        bytes _data
    );
    event TokensConfirmed(
        address _tokenAddress,
        uint _poolTokenBalance
    );
    event TokenTransfer(
        address _tokenAddress,
        address _to,
        uint _value,
        bool _succeeded,
        uint _poolTokenBalance
    );
    event Withdrawl(
        address _to,
        uint _value,
        uint _remaining,
        uint _contribution,
        uint _poolContributionBalance
    );
    event RefundClaimed(
        address _to,
        uint _value
    );
    event ContributionSettingsChanged(
        uint _minContribution,
        uint _maxContribution,
        uint _maxPoolBalance
    );
    event ContributionAdjusted(
        address _participant,
        uint _remaining,
        uint _contribution,
        uint _poolContributionBalance
    );
    event WhitelistEnabled();
    event WhitelistDisabled();
    event IncludedInWhitelist(
        address _participant
    );
    event RemovedFromWhitelist(
        address _participant
    );
    event StateChange(
        State _from,
        State _to
    );
    event AddAdmin(
        address _admin
    );

    modifier onlyAdmins() {
        require(Util.contains(admins, msg.sender));
        _;
    }

    modifier onState(State s) {
        require(state == s);
        _;
    }

    modifier canClaimTokens() {
        require(state == State.Paid && expectedTokenAddress != address(0));
        _;
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
        address _autoDistributeGasRecipient
    ) payable
    {
        AddAdmin(msg.sender);
        admins.push(msg.sender);

        feeManager = FeeManager(_feeManager);
        feesPerEther = feeManager.create(_creatorFeesPerEther, msg.sender);
        FeeInstalled(
            feesPerEther,
            _creatorFeesPerEther,
            _feeManager
        );

        AutoDistributionConfigured(
            MAX_GAS_PRICE,
            _totalTokenDrops,
            _autoDistributeGasRecipient
        );
        totalTokenDrops = _totalTokenDrops;
        autoDistributeGasRecipient = _autoDistributeGasRecipient;

        ContributionSettingsChanged(
            _minContribution,
            _maxContribution,
            _maxPoolBalance
        );
        minContribution = _minContribution;
        maxContribution = _maxContribution;
        maxPoolBalance = _maxPoolBalance;
        validatePoolSettings();

        if (_restricted) {
            restricted = true;
            WhitelistEnabled();
        }

        balances[msg.sender].whitelisted = true;

        for (uint i = 0; i < _admins.length; i++) {
            address admin = _admins[i];
            AddAdmin(admin);
            admins.push(admin);
            balances[admin].whitelisted = true;
        }

        if (msg.value > 0) {
            deposit();
        }
    }

    function deposit() payable public onState(State.Open) {
        require(msg.value > 0);
        require(included(msg.sender));

        uint newContribution;
        uint newRemaining;
        (newContribution, newRemaining) = getContribution(msg.sender, msg.value);
        // must respect the maxContribution and maxPoolBalance limits
        require(newRemaining == 0);

        ParticipantState storage balance = balances[msg.sender];
        if (balance.contribution == 0) {
            totalContributors++;
        }

        poolContributionBalance = poolContributionBalance - balance.contribution + newContribution;
        (balance.contribution, balance.remaining) = (newContribution, newRemaining);

        if (!balance.exists) {
            balance.whitelisted = true;
            balance.exists = true;
            participants.push(msg.sender);
        }
        Deposit(msg.sender, msg.value, balance.contribution, poolContributionBalance);
    }

    function () external payable onState(State.Refund) {
        require(msg.sender == refundSenderAddress);
        RefundRecieved(msg.value);
    }

    function airdropEther(uint gasPrice) external payable canClaimTokens {
        uint gasCosts = autoDistributionFees(gasPrice, totalContributors, 1);
        EtherAirdropRecieved(msg.sender, msg.value - gasCosts, gasPrice);
        if (gasPrice > 0) {
            require(msg.value > gasCosts);
            transferAutoDistributionFees(gasCosts);
        } else {
            require(msg.value > 0);
        }
    }

    function airdropTokens(address tokenAddress, uint gasPrice) external payable canClaimTokens {
        uint gasCosts = autoDistributionFees(gasPrice, totalContributors, 1);
        require(msg.value >= gasCosts && msg.value <= 2*gasCosts);
        AutoDistributeTokenAirdrop(msg.sender, tokenAddress, gasPrice);
        transferAutoDistributionFees(msg.value);
    }

    function tokenFallback(address _from, uint _value, bytes _data) external onState(State.Paid) {
        ERC223TokensReceived(
            msg.sender,
            _from,
            _value,
            _data
        );
    }

    function version() external pure returns (uint, uint, uint) {
        return (2, 0, 0);
    }

    function fail() external onlyAdmins onState(State.Open) {
        changeState(State.Failed);
        poolRemainingBalance = this.balance - poolContributionBalance;
        if (totalTokenDrops > 0) {
            uint gasCosts = autoDistributionFees(MAX_GAS_PRICE, totalContributors, 1);
            transferAutoDistributionFees(gasCosts);
        }
    }

    function discountFees(uint recipientFeesPerEther, uint teamFeesPerEther) external onState(State.Open) {
        require(msg.sender == tx.origin);
        require(feesPerEther >= (recipientFeesPerEther + teamFeesPerEther));
        feesPerEther = recipientFeesPerEther + teamFeesPerEther;
        feeManager.discountFees(recipientFeesPerEther, teamFeesPerEther);
    }

    function payToPresale(address _presaleAddress, uint minPoolBalance, uint gasLimit, bytes data) external onlyAdmins onState(State.Open) {
        require(poolContributionBalance >= minPoolBalance);
        require(poolContributionBalance > 0);
        changeState(State.Paid);
        assert(this.balance >= poolContributionBalance);

        totalFees = (poolContributionBalance * feesPerEther) / 1 ether;
        poolRemainingBalance = this.balance - poolContributionBalance;

        uint gasCosts = autoDistributionFees(MAX_GAS_PRICE, totalContributors, totalTokenDrops);
        transferAutoDistributionFees(gasCosts);
        require(
            _presaleAddress.call.gas(
                (gasLimit > 0) ? gasLimit : msg.gas
            ).value(
                poolContributionBalance - totalFees - gasCosts
            )(data)
        );
    }

    function forwardTransaction(address destination, uint gasLimit, bytes data) payable external onlyAdmins {
        require(state != State.Failed);
        TransactionForwarded(destination, gasLimit, data);
        require(
            destination.call.gas(
                (gasLimit > 0) ? gasLimit : msg.gas
            ).value(
                msg.value
            )(data)
        );
    }

    function expectRefund(address sender) external onlyAdmins {
        require(state == State.Paid || state == State.Refund);
        require(expectedTokenAddress == address(0));
        totalFees = 0;
        if (sender != refundSenderAddress) {
            refundSenderAddress = sender;
            ExpectingRefund(sender);
        }
        if (state == State.Paid) {
            changeState(State.Refund);
        }
    }

    function transferFees() public canClaimTokens returns(uint) {
        require(totalFees > 0);
        uint amount = totalFees;
        totalFees = 0;
        FeesTransferred(amount);
        return feeManager.sendFees.value(amount)();
    }

    function transferAndDistributeFees() public {
        uint creatorFees = transferFees();
        if (creatorFees > 0) {
            FeesDistributed();
            feeManager.distributeFees(this);
        }
    }

    function confirmTokens(address tokenAddress, bool claimFees) external onlyAdmins onState(State.Paid) {
        require(expectedTokenAddress == address(0));
        expectedTokenAddress = tokenAddress;
        ERC20 tokenContract = ERC20(tokenAddress);
        require(tokenContract.balanceOf(address(this)) > 0);
        TokensConfirmed(
            tokenAddress,
            tokenContract.balanceOf(address(this))
        );

        if (claimFees) {
            transferAndDistributeFees();
        }
    }

    function withdrawAll() external {
        if (state == State.Open) {
            ParticipantState storage balance = balances[msg.sender];
            uint total = balance.remaining;
            if (total + balance.contribution == 0) {
                return;
            }
            if (balance.contribution > 0) {
                totalContributors--;
                total += balance.contribution;
            }

            poolContributionBalance -= balance.contribution;
            balance.contribution = 0;

            Withdrawl(
                msg.sender,
                total,
                0,
                0,
                poolContributionBalance
            );

            balance.remaining = 0;
            require(
                msg.sender.call.value(total)()
            );
        } else if (state == State.Refund || state == State.Failed || state == State.Paid) {
            withdrawRemainingAndSurplus(msg.sender);
        }
    }

    function withdrawAllForMany(address[] recipients) external {
        require(
            state == State.Refund || state == State.Failed || state == State.Paid
        );

        for (uint i = 0; i < recipients.length; i++) {
            withdrawRemainingAndSurplus(recipients[i]);
        }
    }

    function withdraw(uint amount) external onState(State.Open) {
        ParticipantState storage balance = balances[msg.sender];
        uint total = balance.remaining + balance.contribution;
        require(total >= amount && amount >= balance.remaining);

        uint debit = amount - balance.remaining;
        balance.remaining = 0;
        if (debit > 0) {
            balance.contribution -= debit;
            poolContributionBalance -= debit;
            require(
                balance.contribution >= minContribution || balance.contribution == 0
            );
            if (balance.contribution == 0) {
                totalContributors--;
            }
        }

        Withdrawl(
            msg.sender,
            amount,
            balance.remaining,
            balance.contribution,
            poolContributionBalance
        );
        require(
            msg.sender.call.value(amount)()
        );
    }

    function transferAllTokens(address tokenAddress) external canClaimTokens {
        uint tokenBalance = ERC20(tokenAddress).balanceOf(address(this));

        for (uint i = 0; i < participants.length; i++) {
            if (tokenBalance > 0) {
                tokenBalance = transferTokensToRecipient(tokenAddress, participants[i], tokenBalance);
            }
            withdrawRemaining(participants[i]);
        }
    }

    function transferTokensTo(address tokenAddress, address[] recipients) external canClaimTokens {
        uint tokenBalance = ERC20(tokenAddress).balanceOf(address(this));

        for (uint i = 0; i < recipients.length; i++) {
            if (tokenBalance > 0) {
                tokenBalance = transferTokensToRecipient(tokenAddress, recipients[i], tokenBalance);
            }
            withdrawRemaining(recipients[i]);
        }
    }

    function modifyWhitelist(address[] toInclude, address[] toExclude) external onlyAdmins onState(State.Open) {
        if (!restricted) {
            WhitelistEnabled();
            restricted = true;
        }
        uint i = 0;

        for (i = 0; i < toExclude.length; i++) {
            address participant = toExclude[i];
            ParticipantState storage balance = balances[participant];

            if (balance.whitelisted) {
                balance.whitelisted = false;
                RemovedFromWhitelist(participant);

                if (balance.contribution > 0) {
                    totalContributors--;
                    poolContributionBalance -= balance.contribution;
                    balance.remaining += balance.contribution;
                    balance.contribution = 0;
                    ContributionAdjusted(
                        participant,
                        balance.remaining,
                        balance.contribution,
                        poolContributionBalance
                    );
                }
            }
        }

        for (i = 0; i < toInclude.length; i++) {
            includeInWhitelist(toInclude[i]);
        }
    }

    function removeWhitelist() external onlyAdmins onState(State.Open) {
        require(restricted);
        restricted = false;
        WhitelistDisabled();

        for (uint i = 0; i < participants.length; i++) {
            includeInWhitelist(participants[i]);
        }
    }

    function setTokenDrops(uint _totalTokenDrops) external onlyAdmins onState(State.Open) {
        totalTokenDrops = _totalTokenDrops;
        validatePoolSettings();
        AutoDistributionConfigured(
            MAX_GAS_PRICE,
            totalTokenDrops,
            autoDistributeGasRecipient
        );
    }

    function setContributionSettings(uint _minContribution, uint _maxContribution, uint _maxPoolBalance, address[] toRebalance) external onlyAdmins onState(State.Open) {
        // we raised the minContribution threshold
        bool rebalanceForAll = (minContribution < _minContribution);
        // we lowered the maxContribution threshold
        rebalanceForAll = rebalanceForAll || (maxContribution > _maxContribution);
        // we want to make maxPoolBalance lower than the current pool balance
        rebalanceForAll = rebalanceForAll || (poolContributionBalance > _maxPoolBalance);

        minContribution = _minContribution;
        maxContribution = _maxContribution;
        maxPoolBalance = _maxPoolBalance;

        validatePoolSettings();
        ContributionSettingsChanged(minContribution, maxContribution, maxPoolBalance);


        uint i;
        ParticipantState storage balance;
        address participant;
        if (rebalanceForAll) {
            poolContributionBalance = 0;
            totalContributors = 0;
            for (i = 0; i < participants.length; i++) {
                participant = participants[i];
                balance = balances[participant];

                balance.remaining += balance.contribution;
                balance.contribution = 0;
                (balance.contribution, balance.remaining) = getContribution(participant, 0);
                if (balance.contribution > 0) {
                    poolContributionBalance += balance.contribution;
                    totalContributors++;
                }

                ContributionAdjusted(
                    participant,
                    balance.remaining,
                    balance.contribution,
                    poolContributionBalance
                );
            }
        } else {
            for (i = 0; i < toRebalance.length; i++) {
                participant = toRebalance[i];
                balance = balances[participant];

                uint newContribution;
                uint newRemaining;
                (newContribution, newRemaining) = getContribution(participant, 0);
                poolContributionBalance = poolContributionBalance - balance.contribution + newContribution;
                if (newContribution > 0 && balance.contribution == 0) {
                    totalContributors++;
                } else if (newContribution == 0 && balance.contribution > 0) {
                    totalContributors--;
                }
                (balance.contribution, balance.remaining) = (newContribution, newRemaining);

                ContributionAdjusted(
                    participant,
                    balance.remaining,
                    balance.contribution,
                    poolContributionBalance
                );
            }
        }
    }

    function getParticipantBalances() external constant returns(address[], uint[], uint[], bool[], bool[]) {
        uint[] memory contribution = new uint[](participants.length);
        uint[] memory remaining = new uint[](participants.length);
        bool[] memory whitelisted = new bool[](participants.length);
        bool[] memory exists = new bool[](participants.length);

        for (uint i = 0; i < participants.length; i++) {
            ParticipantState storage balance = balances[participants[i]];
            contribution[i] = balance.contribution;
            remaining[i] = balance.remaining;
            whitelisted[i] = balance.whitelisted;
            exists[i] = balance.exists;
        }

        return (participants, contribution, remaining, whitelisted, exists);
    }

    function includeInWhitelist(address participant) internal {
        ParticipantState storage balance = balances[participant];

        if (balance.whitelisted) {
            return;
        }

        balance.whitelisted = true;
        IncludedInWhitelist(participant);
        if (balance.remaining == 0) {
            return;
        }

        (balance.contribution, balance.remaining) = getContribution(participant, 0);
        if (balance.contribution > 0) {
            totalContributors++;
            poolContributionBalance += balance.contribution;
            ContributionAdjusted(
                participant,
                balance.remaining,
                balance.contribution,
                poolContributionBalance
            );
        }
    }

    function changeState(State desiredState) internal {
        StateChange(state, desiredState);
        state = desiredState;
    }

    function withdrawRemainingAndSurplus(address recipient) internal {
        ParticipantState storage balance = balances[recipient];
        uint total = balance.remaining;

        uint share = extraEtherDeposits.claimShare(
            recipient,
            this.balance - totalFees - poolRemainingBalance,
            [balance.contribution, poolContributionBalance]
        );
        if (share == 0 && total == 0) {
            return;
        }

        Withdrawl(
            recipient,
            total,
            0,
            balance.contribution,
            poolContributionBalance
        );

        poolRemainingBalance -= total;
        total += share;
        RefundClaimed(recipient, share);


        balance.remaining = 0;
        require(
            recipient.call.value(total)()
        );
    }

    function withdrawRemaining(address recipient) internal {
        if (poolRemainingBalance == 0) {
            return;
        }

        ParticipantState storage balance = balances[recipient];
        uint total = balance.remaining;

        if (total == 0) {
            return;
        }

        Withdrawl(
            recipient,
            total,
            0,
            balance.contribution,
            poolContributionBalance
        );

        poolRemainingBalance -= total;
        balance.remaining = 0;
        require(
            recipient.call.value(total)()
        );
    }

    function transferTokensToRecipient(address tokenAddress, address recipient, uint tokenBalance) internal returns(uint) {
        ParticipantState storage balance = balances[recipient];
        uint share = tokenDeposits[tokenAddress].claimShare(
            recipient,
            tokenBalance,
            [balance.contribution, poolContributionBalance]
        );

        tokenBalance -= share;
        bool succeeded = ERC20(tokenAddress).transfer(recipient, share);
        if (!succeeded) {
            tokenDeposits[tokenAddress].undoClaim(recipient, share);
            tokenBalance += share;
        }

        TokenTransfer(tokenAddress, recipient, share, succeeded, tokenBalance);
        return tokenBalance;
    }

    function transferAutoDistributionFees(uint gasCosts) internal {
        if (gasCosts > 0) {
            autoDistributeGasRecipient.transfer(gasCosts);
        }
    }

    function autoDistributionFees(uint gasPrice, uint numContributors, uint transfersPerContributor) internal returns(uint) {
        return gasPrice * numContributors * transfersPerContributor * AUTO_DISTRIBUTE_GAS;
    }

    function validatePoolSettings() internal constant {
        require(
            totalTokenDrops <= MAX_POSSIBLE_TOKEN_DROPS &&
            minContribution <= maxContribution &&
            maxContribution <= maxPoolBalance &&
            maxPoolBalance <= MAX_POSSIBLE_AMOUNT
        );

        uint gasCosts = autoDistributionFees(MAX_GAS_PRICE, 1, totalTokenDrops);
        require(minContribution >= 2 * gasCosts);
    }

    function included(address participant) internal constant returns (bool) {
        return !restricted || balances[participant].whitelisted;
    }

    function getContribution(address participant, uint amount) internal constant returns (uint, uint) {
        ParticipantState storage balance = balances[participant];
        uint total = balance.remaining + balance.contribution + amount;
        uint contribution = total;
        if (!included(participant)) {
            return (0, total);
        }

        contribution = Util.min(maxContribution, contribution);
        contribution = Util.min(maxPoolBalance - poolContributionBalance + balance.contribution, contribution);
        if (contribution < minContribution) {
            return (0, total);
        }
        return (contribution, total - contribution);
    }
}
