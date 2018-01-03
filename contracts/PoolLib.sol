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

library PoolLib {
    using QuotaTracker for QuotaTracker.Data;

    enum State { Open, Failed, Paid, Refund }
    struct ParticipantState {
        uint contribution;
        uint remaining;
        bool whitelisted;
        bool exists;
    }

    struct PoolStorage {
        State state;

        address[] admins;

        uint minContribution;
        uint maxContribution;
        uint maxPoolBalance;

        address[] participants;

        bool restricted;

        mapping (address => ParticipantState) balances;
        uint poolContributionBalance;
        uint poolRemainingBalance;
        uint totalContributors;

        address refundSenderAddress;
        QuotaTracker.Data extraEtherDeposits;
        mapping (address => QuotaTracker.Data) tokenDeposits;

        address expectedTokenAddress;

        FeeManager feeManager;
        uint totalFees;
        uint feesPerEther;

        uint totalTokenDrops;
        address autoDistributionWallet;
    }


    event Deposit(
        address _from,
        uint _value,
        uint _contributionTotal,
        uint _poolContributionBalance
    );
    event AutoDistributionConfigured(
        uint _autoDistributeGasPrice,
        uint _totalTokenDrops,
        address _autoDistributionWallet
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
        address _senderAddress,
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
    event Withdrawal(
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
        uint8 _from,
        uint8 _to
    );
    event AddAdmin(
        address _admin
    );

    function onlyAdmins(PoolStorage storage self) {
        require(Util.contains(self.admins, msg.sender));
    }

    function onState(PoolStorage storage self, State s) {
        require(self.state == s);
    }

    function canClaimTokens(PoolStorage storage self) {
        require(self.state == State.Paid && self.expectedTokenAddress != address(0));
    }

    function create(
        PoolStorage storage self,
        address _feeManager,
        uint _creatorFeesPerEther,
        uint _minContribution,
        uint _maxContribution,
        uint _maxPoolBalance,
        address[] _admins,
        bool _restricted,
        uint _totalTokenDrops,
        address _autoDistributionWallet
    ) {
        AddAdmin(msg.sender);
        self.admins.push(msg.sender);

        self.feeManager = FeeManager(_feeManager);
        self.feesPerEther = self.feeManager.create(_creatorFeesPerEther, msg.sender);
        FeeInstalled(
            self.feesPerEther,
            _creatorFeesPerEther,
            _feeManager
        );

        AutoDistributionConfigured(
            60e9,
            _totalTokenDrops,
            _autoDistributionWallet
        );
        self.totalTokenDrops = _totalTokenDrops;
        self.autoDistributionWallet = _autoDistributionWallet;

        ContributionSettingsChanged(
            _minContribution,
            _maxContribution,
            _maxPoolBalance
        );
        self.minContribution = _minContribution;
        self.maxContribution = _maxContribution;
        self.maxPoolBalance = _maxPoolBalance;
        validatePoolSettings(self);

        if (_restricted) {
            self.restricted = true;
            WhitelistEnabled();
        }

        self.balances[msg.sender].whitelisted = true;

        for (uint i = 0; i < _admins.length; i++) {
            address admin = _admins[i];
            AddAdmin(admin);
            self.admins.push(admin);
            self.balances[admin].whitelisted = true;
        }
    }

    function deposit(PoolStorage storage self) {
        onState(self, State.Open);
        require(msg.value > 0);
        require(included(self, msg.sender));

        uint newContribution;
        uint newRemaining;
        (newContribution, newRemaining) = getContribution(self, msg.sender, msg.value);
        // must respect the maxContribution and maxPoolBalance limits
        require(newRemaining == 0);

        ParticipantState storage balance = self.balances[msg.sender];
        if (balance.contribution == 0) {
            self.totalContributors++;
        }

        self.poolContributionBalance = self.poolContributionBalance - balance.contribution + newContribution;
        (balance.contribution, balance.remaining) = (newContribution, newRemaining);

        if (!balance.exists) {
            balance.whitelisted = true;
            balance.exists = true;
            self.participants.push(msg.sender);
        }
        Deposit(msg.sender, msg.value, balance.contribution, self.poolContributionBalance);
    }

    function refund(PoolStorage storage self) {
        onState(self, State.Refund);
        require(msg.sender == self.refundSenderAddress);
        RefundRecieved(msg.sender, msg.value);
    }

    function airdropEther(PoolStorage storage self, uint gasPrice) {
        canClaimTokens(self);
        uint gasCosts = autoDistributionFees(gasPrice, self.totalContributors, 1);
        EtherAirdropRecieved(msg.sender, msg.value - gasCosts, gasPrice);
        if (gasPrice > 0) {
            require(msg.value > gasCosts);
            transferAutoDistributionFees(self, gasCosts);
        } else {
            require(msg.value > 0);
        }
    }

    function airdropTokens(PoolStorage storage self, address tokenAddress, uint gasPrice) {
        canClaimTokens(self);
        uint gasCosts = autoDistributionFees(gasPrice, self.totalContributors, 1);
        require(msg.value >= gasCosts && msg.value <= 2*gasCosts);
        AutoDistributeTokenAirdrop(msg.sender, tokenAddress, gasPrice);
        transferAutoDistributionFees(self, msg.value);
    }

    function fail(PoolStorage storage self) {
        onlyAdmins(self);
        onState(self, State.Open);
        changeState(self, State.Failed);
        self.poolRemainingBalance = this.balance - self.poolContributionBalance;
        if (self.totalTokenDrops > 0) {
            uint gasCosts = autoDistributionFees(60e9, self.totalContributors, 1);
            transferAutoDistributionFees(self, gasCosts);
        }
    }

    function tokenFallback(PoolStorage storage self, address _from, uint _value, bytes _data) {
        onState(self, State.Paid);
        ERC223TokensReceived(
            msg.sender,
            _from,
            _value,
            _data
        );
    }

    function version() pure returns (uint, uint, uint) {
        return (2, 0, 0);
    }

    function discountFees(PoolStorage storage self, uint recipientFeesPerEther, uint teamFeesPerEther) {
        onState(self, State.Open);
        require(msg.sender == tx.origin);
        require(self.feesPerEther >= (recipientFeesPerEther + teamFeesPerEther));
        self.feesPerEther = recipientFeesPerEther + teamFeesPerEther;
        self.feeManager.discountFees(recipientFeesPerEther, teamFeesPerEther);
    }

    function payToPresale(PoolStorage storage self, address _presaleAddress, uint minPoolBalance, uint gasLimit, bytes data) {
        onlyAdmins(self);
        onState(self, State.Open);
        require(self.poolContributionBalance >= minPoolBalance);
        require(self.poolContributionBalance > 0);
        changeState(self, State.Paid);
        assert(this.balance >= self.poolContributionBalance);

        self.totalFees = (self.poolContributionBalance * self.feesPerEther) / 1 ether;
        self.poolRemainingBalance = this.balance - self.poolContributionBalance;

        uint gasCosts = autoDistributionFees(60e9, self.totalContributors, self.totalTokenDrops);
        transferAutoDistributionFees(self, gasCosts);
        require(
            _presaleAddress.call.gas(
                (gasLimit > 0) ? gasLimit : msg.gas
            ).value(
                self.poolContributionBalance - self.totalFees - gasCosts
            )(data)
        );
    }

    function forwardTransaction(PoolStorage storage self, address destination, uint gasLimit, bytes data) {
        onlyAdmins(self);
        require(self.state != State.Failed);
        TransactionForwarded(destination, gasLimit, data);
        require(
            destination.call.gas(
                (gasLimit > 0) ? gasLimit : msg.gas
            ).value(0)(data)
        );
    }

    function expectRefund(PoolStorage storage self, address sender) {
        onlyAdmins(self);
        require(self.state == State.Paid || self.state == State.Refund);
        require(self.expectedTokenAddress == address(0));
        self.totalFees = 0;
        if (sender != self.refundSenderAddress) {
            self.refundSenderAddress = sender;
            ExpectingRefund(sender);
        }
        if (self.state == State.Paid) {
            changeState(self, State.Refund);
        }
    }

    function transferFees(PoolStorage storage self) returns(uint) {
        canClaimTokens(self);
        require(self.totalFees > 0);
        uint amount = self.totalFees;
        self.totalFees = 0;
        FeesTransferred(amount);
        return self.feeManager.sendFees.value(amount)();
    }

    function transferAndDistributeFees(PoolStorage storage self) {
        uint creatorFees = transferFees(self);
        if (creatorFees > 0) {
            FeesDistributed();
            self.feeManager.distributeFees(this);
        }
    }

    function confirmTokens(PoolStorage storage self, address tokenAddress, bool claimFees) {
        onlyAdmins(self);
        onState(self, State.Paid);
        require(self.expectedTokenAddress == address(0));
        self.expectedTokenAddress = tokenAddress;
        ERC20 tokenContract = ERC20(tokenAddress);
        require(tokenContract.balanceOf(address(this)) > 0);
        TokensConfirmed(
            tokenAddress,
            tokenContract.balanceOf(address(this))
        );

        if (claimFees) {
            transferAndDistributeFees(self);
        }
    }

    function withdrawAll(PoolStorage storage self) {
        if (self.state == State.Open) {
            ParticipantState storage balance = self.balances[msg.sender];
            uint total = balance.remaining;
            if (total + balance.contribution == 0) {
                return;
            }
            if (balance.contribution > 0) {
                self.totalContributors--;
                total += balance.contribution;
            }

            self.poolContributionBalance -= balance.contribution;
            balance.contribution = 0;

            Withdrawal(
                msg.sender,
                total,
                0,
                0,
                self.poolContributionBalance
            );

            balance.remaining = 0;
            require(
                msg.sender.call.value(total)()
            );
        } else if (self.state == State.Refund || self.state == State.Failed || self.state == State.Paid) {
            withdrawRemainingAndSurplus(self, msg.sender);
        }
    }

    function withdrawAllForMany(PoolStorage storage self, address[] recipients) {
        require(
            self.state == State.Refund || self.state == State.Failed || self.state == State.Paid
        );

        for (uint i = 0; i < recipients.length; i++) {
            withdrawRemainingAndSurplus(self, recipients[i]);
        }
    }

    function withdraw(PoolStorage storage self, uint amount) {
        onState(self, State.Open);
        ParticipantState storage balance = self.balances[msg.sender];
        uint total = balance.remaining + balance.contribution;
        require(total >= amount && amount >= balance.remaining);

        uint debit = amount - balance.remaining;
        balance.remaining = 0;
        if (debit > 0) {
            balance.contribution -= debit;
            self.poolContributionBalance -= debit;
            require(
                balance.contribution >= self.minContribution || balance.contribution == 0
            );
            if (balance.contribution == 0) {
                self.totalContributors--;
            }
        }

        Withdrawal(
            msg.sender,
            amount,
            balance.remaining,
            balance.contribution,
            self.poolContributionBalance
        );
        require(
            msg.sender.call.value(amount)()
        );
    }

    function transferAllTokens(PoolStorage storage self, address tokenAddress) {
        canClaimTokens(self);
        uint tokenBalance = ERC20(tokenAddress).balanceOf(address(this));

        for (uint i = 0; i < self.participants.length; i++) {
            if (tokenBalance > 0) {
                tokenBalance = transferTokensToRecipient(self, tokenAddress, self.participants[i], tokenBalance);
            }
            withdrawRemaining(self, self.participants[i]);
        }
    }

    function transferTokensTo(PoolStorage storage self, address tokenAddress, address[] recipients) {
        canClaimTokens(self);
        uint tokenBalance = ERC20(tokenAddress).balanceOf(address(this));

        for (uint i = 0; i < recipients.length; i++) {
            if (tokenBalance > 0) {
                tokenBalance = transferTokensToRecipient(self, tokenAddress, recipients[i], tokenBalance);
            }
            withdrawRemaining(self, recipients[i]);
        }
    }

    function modifyWhitelist(PoolStorage storage self, address[] toInclude, address[] toExclude) {
        onlyAdmins(self);
        onState(self, State.Open);
        if (!self.restricted) {
            WhitelistEnabled();
            self.restricted = true;
        }
        uint i = 0;

        for (i = 0; i < toExclude.length; i++) {
            address participant = toExclude[i];
            ParticipantState storage balance = self.balances[participant];

            if (balance.whitelisted) {
                balance.whitelisted = false;
                RemovedFromWhitelist(participant);

                if (balance.contribution > 0) {
                    self.totalContributors--;
                    self.poolContributionBalance -= balance.contribution;
                    balance.remaining += balance.contribution;
                    balance.contribution = 0;
                    ContributionAdjusted(
                        participant,
                        balance.remaining,
                        balance.contribution,
                        self.poolContributionBalance
                    );
                }
            }
        }

        for (i = 0; i < toInclude.length; i++) {
            includeInWhitelist(self, toInclude[i]);
        }
    }

    function removeWhitelist(PoolStorage storage self) {
        onlyAdmins(self);
        onState(self, State.Open);
        require(self.restricted);
        self.restricted = false;
        WhitelistDisabled();

        for (uint i = 0; i < self.participants.length; i++) {
            includeInWhitelist(self, self.participants[i]);
        }
    }

    function setTokenDrops(PoolStorage storage self, uint _totalTokenDrops) {
        onlyAdmins(self);
        onState(self, State.Open);
        self.totalTokenDrops = _totalTokenDrops;
        validatePoolSettings(self);
        AutoDistributionConfigured(
            60e9,
            self.totalTokenDrops,
            self.autoDistributionWallet
        );
    }

    function setContributionSettings(PoolStorage storage self, uint _minContribution, uint _maxContribution, uint _maxPoolBalance, address[] toRebalance) {
        onlyAdmins(self);
        onState(self, State.Open);
        // we raised the minContribution threshold
        bool rebalanceForAll = (self.minContribution < _minContribution);
        // we lowered the maxContribution threshold
        rebalanceForAll = rebalanceForAll || (self.maxContribution > _maxContribution);
        // we want to make maxPoolBalance lower than the current pool balance
        rebalanceForAll = rebalanceForAll || (self.poolContributionBalance > _maxPoolBalance);

        self.minContribution = _minContribution;
        self.maxContribution = _maxContribution;
        self.maxPoolBalance = _maxPoolBalance;

        validatePoolSettings(self);
        ContributionSettingsChanged(self.minContribution, self.maxContribution, self.maxPoolBalance);


        uint i;
        ParticipantState storage balance;
        address participant;
        if (rebalanceForAll) {
            self.poolContributionBalance = 0;
            self.totalContributors = 0;
            for (i = 0; i < self.participants.length; i++) {
                participant = self.participants[i];
                balance = self.balances[participant];

                balance.remaining += balance.contribution;
                balance.contribution = 0;
                (balance.contribution, balance.remaining) = getContribution(self, participant, 0);
                if (balance.contribution > 0) {
                    self.poolContributionBalance += balance.contribution;
                    self.totalContributors++;
                }

                ContributionAdjusted(
                    participant,
                    balance.remaining,
                    balance.contribution,
                    self.poolContributionBalance
                );
            }
        } else {
            for (i = 0; i < toRebalance.length; i++) {
                participant = toRebalance[i];
                balance = self.balances[participant];

                uint newContribution;
                uint newRemaining;
                (newContribution, newRemaining) = getContribution(self, participant, 0);
                self.poolContributionBalance = self.poolContributionBalance - balance.contribution + newContribution;
                if (newContribution > 0 && balance.contribution == 0) {
                    self.totalContributors++;
                } else if (newContribution == 0 && balance.contribution > 0) {
                    self.totalContributors--;
                }
                (balance.contribution, balance.remaining) = (newContribution, newRemaining);

                ContributionAdjusted(
                    participant,
                    balance.remaining,
                    balance.contribution,
                    self.poolContributionBalance
                );
            }
        }
    }

    function includeInWhitelist(PoolStorage storage self, address participant) {
        ParticipantState storage balance = self.balances[participant];

        if (balance.whitelisted) {
            return;
        }

        balance.whitelisted = true;
        IncludedInWhitelist(participant);
        if (balance.remaining == 0) {
            return;
        }

        (balance.contribution, balance.remaining) = getContribution(self, participant, 0);
        if (balance.contribution > 0) {
            self.totalContributors++;
            self.poolContributionBalance += balance.contribution;
            ContributionAdjusted(
                participant,
                balance.remaining,
                balance.contribution,
                self.poolContributionBalance
            );
        }
    }

    function changeState(PoolStorage storage self, State desiredState) {
        StateChange(uint8(self.state), uint8(desiredState));
        self.state = desiredState;
    }

    function withdrawRemainingAndSurplus(PoolStorage storage self, address recipient) {
        ParticipantState storage balance = self.balances[recipient];
        uint total = balance.remaining;

        uint share = self.extraEtherDeposits.claimShare(
            recipient,
            this.balance - self.totalFees - self.poolRemainingBalance,
            [balance.contribution, self.poolContributionBalance]
        );
        if (share == 0 && total == 0) {
            return;
        }

        Withdrawal(
            recipient,
            total,
            0,
            balance.contribution,
            self.poolContributionBalance
        );

        self.poolRemainingBalance -= total;
        total += share;
        RefundClaimed(recipient, share);


        balance.remaining = 0;
        require(
            recipient.call.value(total)()
        );
    }

    function withdrawRemaining(PoolStorage storage self, address recipient) {
        if (self.poolRemainingBalance == 0) {
            return;
        }

        ParticipantState storage balance = self.balances[recipient];
        uint total = balance.remaining;

        if (total == 0) {
            return;
        }

        Withdrawal(
            recipient,
            total,
            0,
            balance.contribution,
            self.poolContributionBalance
        );

        self.poolRemainingBalance -= total;
        balance.remaining = 0;
        require(
            recipient.call.value(total)()
        );
    }

    function transferTokensToRecipient(PoolStorage storage self, address tokenAddress, address recipient, uint tokenBalance) returns(uint) {
        ParticipantState storage balance = self.balances[recipient];
        uint share = self.tokenDeposits[tokenAddress].claimShare(
            recipient,
            tokenBalance,
            [balance.contribution, self.poolContributionBalance]
        );

        tokenBalance -= share;
        bool succeeded = ERC20(tokenAddress).transfer(recipient, share);
        if (!succeeded) {
            self.tokenDeposits[tokenAddress].undoClaim(recipient, share);
            tokenBalance += share;
        }

        TokenTransfer(tokenAddress, recipient, share, succeeded, tokenBalance);
        return tokenBalance;
    }

    function transferAutoDistributionFees(PoolStorage storage self, uint gasCosts) {
        if (gasCosts > 0) {
            self.autoDistributionWallet.transfer(gasCosts);
        }
    }

    function autoDistributionFees(uint gasPrice, uint numContributors, uint transfersPerContributor) returns(uint) {
        return gasPrice * numContributors * transfersPerContributor * 150000;
    }

    function validatePoolSettings(PoolStorage storage self) constant {
        require(
            self.totalTokenDrops <= 10 && self.minContribution <= self.maxContribution && self.maxContribution <= self.maxPoolBalance && self.maxPoolBalance <= 1e9 ether
        );

        uint gasCosts = autoDistributionFees(60e9, 1, self.totalTokenDrops);
        require(self.minContribution >= 2 * gasCosts);
    }

    function included(PoolStorage storage self, address participant) constant returns (bool) {
        return !self.restricted || self.balances[participant].whitelisted;
    }

    function getContribution(PoolStorage storage self, address participant, uint amount) constant returns (uint, uint) {
        ParticipantState storage balance = self.balances[participant];
        uint total = balance.remaining + balance.contribution + amount;
        uint contribution = total;
        if (!included(self, participant)) {
            return (0, total);
        }

        contribution = Util.min(self.maxContribution, contribution);
        contribution = Util.min(self.maxPoolBalance - self.poolContributionBalance + balance.contribution, contribution);
        if (contribution < self.minContribution) {
            return (0, total);
        }
        return (contribution, total - contribution);
    }
}
