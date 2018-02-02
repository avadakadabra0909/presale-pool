pragma solidity 0.4.19;

import "./Util.sol";
import "./QuotaTracker.sol";
import "./PoolRegistry.sol";

interface ERC20 {
    function transfer(address _to, uint _value) public returns (bool success);
    function balanceOf(address _owner) constant public  returns (uint balance);
}

interface FeeManager {
    function create(uint recipientFeesPerEther, address recipient) public  returns(uint);
    function discountFees(address member, uint recipientFeesPerEther, uint teamFeesPerEther) public;
    function sendFees() public payable returns(uint);
    function distributeFees(address contractAddress) public;
    function getTotalFeesPerEther() public returns(uint);
}

library PoolLib {
    using QuotaTracker for QuotaTracker.Data;

    enum State { Open, Failed, Paid, Refund }
    struct ParticipantState {
        uint contribution;
        uint remaining;
        bool admin;
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
        bool feesTransferred;

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
    event EtherAirdropReceived(
        address _senderAddress,
        uint _value,
        uint _autoDistributeGasPrice,
        address _autoDistributionWallet
    );
    event TokenAirdropReceived(
        address _senderAddress,
        address _tokenAddress,
        uint _autoDistributeGasPrice,
        address _autoDistributionWallet
    );
    event RefundReceived(
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

    function onlyAdmins(PoolStorage storage self) public view {
        require(self.balances[msg.sender].admin);
    }

    function onState(PoolStorage storage self, State s) public view {
        require(self.state == s);
    }

    function canClaimTokens(PoolStorage storage self) public view {
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
        address _autoDistributionWallet,
        uint256 code
    ) public {
        PoolRegistry p = PoolRegistry(0x123456789ABCDEF);
        p.register(msg.sender, code);

        self.feeManager = FeeManager(_feeManager);
        FeeInstalled(
            self.feeManager.create(_creatorFeesPerEther, msg.sender),
            _creatorFeesPerEther,
            _feeManager
        );

        self.totalTokenDrops = _totalTokenDrops;
        self.autoDistributionWallet = _autoDistributionWallet;
        AutoDistributionConfigured(
            60e9,
            _totalTokenDrops,
            _autoDistributionWallet
        );

        self.minContribution = _minContribution;
        self.maxContribution = _maxContribution;
        self.maxPoolBalance = _maxPoolBalance;
        validatePoolSettings(self);
        ContributionSettingsChanged(
            _minContribution,
            _maxContribution,
            _maxPoolBalance
        );

        if (_restricted) {
            self.restricted = true;
            WhitelistEnabled();
        }

        self.balances[msg.sender].whitelisted = true;
        self.balances[msg.sender].admin = true;
        AddAdmin(msg.sender);

        for (uint i = 0; i < _admins.length; i++) {
            address admin = _admins[i];
            AddAdmin(admin);
            self.admins.push(admin);
            self.balances[admin].whitelisted = true;
            self.balances[admin].admin = true;
        }
    }

    function deposit(PoolStorage storage self) public {
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

    function refund(PoolStorage storage self) public {
        onState(self, State.Refund);
        require(msg.sender == self.refundSenderAddress);
        RefundReceived(msg.sender, msg.value);
    }

    function airdropEther(PoolStorage storage self, uint gasPrice, address autoDistributionWallet) public {
        require(msg.value > 0);
        canClaimTokens(self);
        uint gasCosts = calcDistributionFees(gasPrice, self.totalContributors, 1);
        require(msg.value > gasCosts);
        EtherAirdropReceived(msg.sender, msg.value - gasCosts, gasPrice, autoDistributionWallet);
        if (gasPrice > 0) {
            autoDistributionWallet.transfer(gasCosts);
        }
    }

    function airdropTokens(PoolStorage storage self, address tokenAddress, uint gasPrice, address autoDistributionWallet) public {
        canClaimTokens(self);
        ERC20 tokenContract = ERC20(tokenAddress);
        require(tokenContract.balanceOf(address(this)) > 0);

        uint gasCosts = calcDistributionFees(gasPrice, self.totalContributors, 1);
        require(msg.value >= gasCosts && msg.value <= 2*gasCosts);
        TokenAirdropReceived(msg.sender, tokenAddress, gasPrice, autoDistributionWallet);
        autoDistributionWallet.transfer(msg.value);
    }

    function fail(PoolStorage storage self) public {
        onlyAdmins(self);
        onState(self, State.Open);
        changeState(self, State.Failed);
        self.poolRemainingBalance = this.balance - self.poolContributionBalance;
        if (self.totalTokenDrops > 0) {
            self.totalTokenDrops = 1;
            uint gasCosts = calcDistributionFees(60e9, self.totalContributors, 1);
            self.autoDistributionWallet.transfer(gasCosts);
        }
    }

    function tokenFallback(PoolStorage storage self, address _from, uint _value, bytes _data) public {
        onState(self, State.Paid);
        ERC223TokensReceived(
            msg.sender,
            _from,
            _value,
            _data
        );
    }

    function version() public pure returns (uint, uint, uint) {
        return (2, 0, 3);
    }

    function discountFees(PoolStorage storage self, uint recipientFeesPerEther, uint teamFeesPerEther) public {
        onState(self, State.Open);
        // Ensure fees are only decreased and not increased
        require(
            self.feeManager.getTotalFeesPerEther() >= (recipientFeesPerEther + teamFeesPerEther)
        );
        FeeInstalled(
            recipientFeesPerEther + teamFeesPerEther,
            recipientFeesPerEther,
            address(self.feeManager)
        );
        self.feeManager.discountFees(msg.sender, recipientFeesPerEther, teamFeesPerEther);
    }

    // Allow admin to send the pool contributions to a wallet or contract (minus fees and auto distrib gas cost)
    function payToPresale(PoolStorage storage self, address _presaleAddress, uint minPoolBalance, uint gasLimit, bytes data) public {
        onlyAdmins(self);
        onState(self, State.Open);
        require(self.poolContributionBalance > 0);
        require(self.poolContributionBalance >= minPoolBalance);
        assert(this.balance >= self.poolContributionBalance);

        changeState(self, State.Paid);

        uint totalFees = (self.poolContributionBalance * self.feeManager.getTotalFeesPerEther()) / 1 ether;
        self.poolRemainingBalance = this.balance - self.poolContributionBalance;

        uint gasCosts = calcDistributionFees(60e9, self.totalContributors, self.totalTokenDrops);
        if (gasCosts > 0) {
            self.autoDistributionWallet.transfer(gasCosts);
        }
        require(
            _presaleAddress.call.gas(
                (gasLimit > 0) ? gasLimit : msg.gas
            ).value(
                self.poolContributionBalance - totalFees - gasCosts
            )(data)
        );
    }

    function forwardTransaction(PoolStorage storage self, address destination, uint gasLimit, bytes data) public {
        onlyAdmins(self);
        require(self.state != State.Failed);
        TransactionForwarded(destination, gasLimit, data);
        require(
            destination.call.gas(
                (gasLimit > 0) ? gasLimit : msg.gas
            ).value(0)(data)
        );
    }

    function expectRefund(PoolStorage storage self, address sender) public {
        onlyAdmins(self);
        require(self.state == State.Paid || self.state == State.Refund);
        require(self.expectedTokenAddress == address(0));
        if (sender != self.refundSenderAddress) {
            self.refundSenderAddress = sender;
            ExpectingRefund(sender);
        }
        if (self.state == State.Paid) {
            changeState(self, State.Refund);
        }
    }

    function transferFees(PoolStorage storage self) public returns(uint) {
        canClaimTokens(self);
        require(!self.feesTransferred);
        self.feesTransferred = true;
        uint totalFees = (self.poolContributionBalance * self.feeManager.getTotalFeesPerEther()) / 1 ether;
        FeesTransferred(totalFees);
        return self.feeManager.sendFees.value(totalFees)();
    }

    function transferAndDistributeFees(PoolStorage storage self) public {
        uint creatorFees = transferFees(self);
        if (creatorFees > 0) {
            FeesDistributed();
            self.feeManager.distributeFees(this);
        }
    }

    function confirmTokens(PoolStorage storage self, address tokenAddress, bool claimFees) public {
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

    function withdrawAll(PoolStorage storage self) public {
        State currentState = self.state;
        if (currentState == State.Open) {
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
            return;
        }
        require(
            currentState == State.Refund || currentState == State.Failed || currentState == State.Paid
        );
        uint feesPerEther = 0;
        if (currentState == State.Paid) {
            feesPerEther = self.feeManager.getTotalFeesPerEther();
        }

        uint gasCostsPerRecipient = calcDistributionFees(60e9, 1, self.totalTokenDrops);
        uint poolContributionBalance = self.poolContributionBalance;
        uint totalFees = (poolContributionBalance * feesPerEther) / 1 ether;
        uint netTotalPoolContribution = poolContributionBalance - totalFees - self.totalContributors * gasCostsPerRecipient;
        uint feesAndRemaining = self.poolRemainingBalance;
        // fees remain in the pool until tokens are confirmed
        if (self.expectedTokenAddress == address(0)) {
            feesAndRemaining += totalFees;
        }

        withdrawRemainingAndSurplus(
            self,
            msg.sender,
            feesPerEther,
            gasCostsPerRecipient,
            this.balance - feesAndRemaining,
            netTotalPoolContribution
        );
    }

    function withdrawAllForMany(PoolStorage storage self, address[] recipients) public {
        State currentState = self.state;
        require(
            currentState == State.Refund || currentState == State.Failed || currentState == State.Paid
        );
        uint feesPerEther = 0;
        if (currentState == State.Paid) {
            feesPerEther = self.feeManager.getTotalFeesPerEther();
        }

        uint gasCostsPerRecipient = calcDistributionFees(60e9, 1, self.totalTokenDrops);
        uint poolContributionBalance = self.poolContributionBalance;
        uint totalFees = (poolContributionBalance * feesPerEther) / 1 ether;
        uint netTotalPoolContribution = poolContributionBalance - totalFees - self.totalContributors * gasCostsPerRecipient;
        uint feesAndRemaining = self.poolRemainingBalance;
        // fees remain in the pool until tokens are confirmed
        if (self.expectedTokenAddress == address(0)) {
            feesAndRemaining += totalFees;
        }

        for (uint i = 0; i < recipients.length; i++) {
            withdrawRemainingAndSurplus(
                self,
                recipients[i],
                feesPerEther,
                gasCostsPerRecipient,
                this.balance - feesAndRemaining,
                netTotalPoolContribution
            );
        }
    }

    function withdraw(PoolStorage storage self, uint amount) public {
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

    // Transfer tokens for all contributors, but can exceed block gas limit
    function transferTokensToAll(PoolStorage storage self, address tokenAddress) public {
        canClaimTokens(self);
        uint tokenBalance = ERC20(tokenAddress).balanceOf(address(this));
        uint gasCostsPerRecipient = calcDistributionFees(60e9, 1, self.totalTokenDrops);
        uint feesPerEther = self.feeManager.getTotalFeesPerEther();
        uint poolContributionBalance = self.poolContributionBalance;
        uint totalFees = (poolContributionBalance * feesPerEther) / 1 ether;
        uint netTotalPoolContribution = poolContributionBalance - totalFees - self.totalContributors * gasCostsPerRecipient;
        QuotaTracker.Data storage quotaTracker = self.tokenDeposits[tokenAddress];

        for (uint i = 0; i < self.participants.length; i++) {
            address recipient = self.participants[i];
            if (tokenBalance > 0) {
                uint share = calculateShare(
                    quotaTracker,
                    recipient,
                    self.balances[recipient].contribution,
                    feesPerEther,
                    gasCostsPerRecipient,
                    tokenBalance,
                    netTotalPoolContribution
                );
                tokenBalance = transferTokensToRecipient(
                    quotaTracker,
                    tokenAddress,
                    recipient,
                    share,
                    tokenBalance
                );
            }
            withdrawRemaining(self, recipient);
        }
    }

    function transferTokensTo(PoolStorage storage self, address tokenAddress, address[] recipients) public {
        canClaimTokens(self);
        uint tokenBalance = ERC20(tokenAddress).balanceOf(address(this));
        uint gasCostsPerRecipient = calcDistributionFees(60e9, 1, self.totalTokenDrops);
        uint feesPerEther = self.feeManager.getTotalFeesPerEther();
        uint poolContributionBalance = self.poolContributionBalance;
        uint totalFees = (poolContributionBalance * feesPerEther) / 1 ether;
        uint netTotalPoolContribution = poolContributionBalance - totalFees - self.totalContributors * gasCostsPerRecipient;
        QuotaTracker.Data storage quotaTracker = self.tokenDeposits[tokenAddress];

        for (uint i = 0; i < recipients.length; i++) {
            address recipient = recipients[i];
            if (tokenBalance > 0) {
                uint share = calculateShare(
                    quotaTracker,
                    recipient,
                    self.balances[recipient].contribution,
                    feesPerEther,
                    gasCostsPerRecipient,
                    tokenBalance,
                    netTotalPoolContribution
                );
                tokenBalance = transferTokensToRecipient(
                    quotaTracker,
                    tokenAddress,
                    recipient,
                    share,
                    tokenBalance
                );
            }
            withdrawRemaining(self, recipient);
        }
    }

    function modifyWhitelist(PoolStorage storage self, address[] toInclude, address[] toExclude) public {
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

    function removeWhitelist(PoolStorage storage self) public {
        onlyAdmins(self);
        onState(self, State.Open);
        require(self.restricted);
        self.restricted = false;
        WhitelistDisabled();

        for (uint i = 0; i < self.participants.length; i++) {
            includeInWhitelist(self, self.participants[i]);
        }
    }

    function setTokenDrops(PoolStorage storage self, uint _totalTokenDrops) public {
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

    function setContributionSettings(PoolStorage storage self, uint _minContribution, uint _maxContribution, uint _maxPoolBalance, address[] toRebalance) public {
        onlyAdmins(self);
        onState(self, State.Open);
        // we raised the minContribution threshold
        bool rebalanceForAll = (self.minContribution < _minContribution);
        // we lowered the maxContribution threshold
        rebalanceForAll = rebalanceForAll || (self.maxContribution > _maxContribution);

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
        } else if (self.poolContributionBalance > self.maxPoolBalance) {
            for (i = self.participants.length - 1; i >= 0 && self.poolContributionBalance > self.maxPoolBalance; i--) {
                participant = self.participants[i];
                balance = self.balances[participant];

                if (balance.contribution == 0) {
                    continue;
                }


                balance.remaining += balance.contribution;
                self.poolContributionBalance -= balance.contribution;
                balance.contribution = 0;
                self.totalContributors--;

                if (self.poolContributionBalance < self.maxPoolBalance) {
                    (balance.contribution, balance.remaining) = getContribution(self, participant, 0);
                    if (balance.contribution > 0) {
                        self.poolContributionBalance += balance.contribution;
                        self.totalContributors++;
                    }
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

    function includeInWhitelist(PoolStorage storage self, address participant) public {
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

    function changeState(PoolStorage storage self, State desiredState) public {
        StateChange(uint8(self.state), uint8(desiredState));
        self.state = desiredState;
    }

    function withdrawRemainingAndSurplus(PoolStorage storage self, address recipient, uint feesPerEther, uint gasCostsPerRecipient, uint availableBalance, uint netTotalPoolContribution) public {
        ParticipantState storage balance = self.balances[recipient];
        uint total = balance.remaining;
        uint share = calculateShare(
            self.extraEtherDeposits,
            recipient,
            balance.contribution,
            feesPerEther,
            gasCostsPerRecipient,
            availableBalance,
            netTotalPoolContribution
        );

        if (share == 0 && total == 0) {
            return;
        }

        // Events
        Withdrawal(
            recipient,
            total,
            0,
            balance.contribution,
            self.poolContributionBalance
        );
        RefundClaimed(recipient, share);

        // Remove only if there is something remaining
        if(total > 0) {
            self.poolRemainingBalance -= total;
            balance.remaining = 0;
        }
        total += share;

        require(
            recipient.call.value(total)()
        );
    }

    function withdrawRemaining(PoolStorage storage self, address recipient) public {
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

    function transferTokensToRecipient(QuotaTracker.Data storage quotaTracker, address tokenAddress, address recipient, uint share, uint availableBalance) public returns(uint) {
        if (share > 0) {
            availableBalance -= share;
            bool succeeded = ERC20(tokenAddress).transfer(recipient, share);
            if (!succeeded) {
                quotaTracker.undoClaim(recipient, share);
                availableBalance += share;
            }

            TokenTransfer(tokenAddress, recipient, share, succeeded, availableBalance);
        }
        return availableBalance;
    }

    function calculateShare(QuotaTracker.Data storage quotaTracker, address recipient, uint contribution, uint feesPerEther, uint gasCostsPerRecipient, uint availableBalance, uint netTotalPoolContribution) public returns(uint) {
        uint numerator = contribution;
        if (numerator == 0) {
            return 0;
        }

        if (feesPerEther > 0) {
            numerator -= (numerator * feesPerEther) / 1 ether;
        }
        numerator -= gasCostsPerRecipient;

        return quotaTracker.claimShare(
            recipient,
            availableBalance,
            [numerator, netTotalPoolContribution]
        );
    }

    // Calculate the fees (ie gas cost) required for distribution
    function calcDistributionFees(uint gasPrice, uint numContributors, uint transfersPerContributor) public pure returns(uint) {
        return gasPrice * numContributors * transfersPerContributor * 150000;
    }

    function validatePoolSettings(PoolStorage storage self) public constant {
        require(
            self.totalTokenDrops <= 10 &&
            self.minContribution <= self.maxContribution &&
            self.maxContribution <= self.maxPoolBalance &&
            self.maxPoolBalance <= 1e9 ether
        );

        uint gasCosts = calcDistributionFees(60e9, 1, self.totalTokenDrops);
        require(self.minContribution >= 2 * gasCosts);
    }

    function included(PoolStorage storage self, address participant) public constant returns (bool) {
        return !self.restricted || self.balances[participant].whitelisted;
    }

    function getContribution(PoolStorage storage self, address participant, uint amount) public constant returns (uint, uint) {
        ParticipantState storage balance = self.balances[participant];
        uint total = balance.remaining + balance.contribution + amount;
        uint contribution = total;
        if (!included(self, participant)) {
            return (0, total);
        }

        if (!balance.admin) {
            contribution = Util.min(self.maxContribution, contribution);
        }
        contribution = Util.min(self.maxPoolBalance - self.poolContributionBalance + balance.contribution, contribution);
        if (contribution < self.minContribution) {
            return (0, total);
        }
        return (contribution, total - contribution);
    }
}
