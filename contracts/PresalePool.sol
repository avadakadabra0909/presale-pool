pragma solidity ^0.4.15;

interface ERC20 {
    function transfer(address _to, uint _value) returns (bool success);
    function balanceOf(address _owner) constant returns (uint balance);
}

interface FeeManager {
    function create(uint _feesPercentage, address[] _recipients);
    function distrbuteFees(address[] _recipients);
}

contract PresalePool {
    enum State { Open, Failed, Paid, TokensReady }
    State public state;

    address[] public admins;

    uint public minContribution;
    uint public maxContribution;
    uint public maxPoolBalance;

    address[] public participants;

    bool public restricted;

    struct ParticipantState {
        uint contribution;
        uint remaining;
        bool whitelisted;
        bool exists;
    }
    mapping (address => ParticipantState) public balances;
    uint public poolBalance;

    address public presaleAddress;
    uint public gasFundBalance;

    ERC20 public token;

    FeeManager public feeManager;
    uint public totalFees;
    uint public feesPercentage;

    event Deposit(
        address indexed _from,
        uint _value,
        uint _poolBalance
    );
    event FeeInstalled(
        uint _percentage
    );
    event TokensReceived(
        address _tokenAddress,
        uint _poolTokenBalance
    );
    event TokenTransfer(
        address indexed _to,
        uint _value,
        bool _succeeded,
        uint _poolTokenBalance
    );
    event Withdrawl(
        address indexed _to,
        uint _value,
        uint _remaining,
        uint _contribution,
        uint _poolBalance
    );
    event ContributionSettingsChanged(
        uint _minContribution,
        uint _maxContribution,
        uint _maxPoolBalance
    );
    event ContributionAdjusted(
        address indexed _participant,
        uint _remaining,
        uint _contribution,
        uint _poolBalance
    );
    event WhitelistEnabled();
    event WhitelistDisabled();
    event IncludedInWhitelist(
        address indexed _participant
    );
    event RemovedFromWhitelist(
        address indexed _participant
    );
    event StateChange(
        State _from,
        State _to
    );
    event AddAdmin(
        address _admin
    );

    modifier onlyAdmins() {
        require(isAdmin(msg.sender));
        _;
    }

    modifier onState(State s) {
        require(state == s);
        _;
    }

    bool locked;
    modifier noReentrancy() {
        require(!locked);
        locked = true;
        _;
        locked = false;
    }

    function PresalePool(
        address _feeManager,
        uint _feesPercentage,
        uint _minContribution,
        uint _maxContribution,
        uint _maxPoolBalance,
        address[] _admins,
        bool _restricted
    ) payable
    {
        AddAdmin(msg.sender);
        admins.push(msg.sender);

        minContribution = _minContribution;
        maxContribution = _maxContribution;
        maxPoolBalance = _maxPoolBalance;
        validateContributionSettings();
        ContributionSettingsChanged(minContribution, maxContribution, maxPoolBalance);

        restricted = _restricted;
        balances[msg.sender].whitelisted = true;

        for (uint i = 0; i < _admins.length; i++) {
            var admin = _admins[i];
            if (!isAdmin(admin)) {
                AddAdmin(admin);
                admins.push(admin);
                balances[admin].whitelisted = true;
            }
        }

        feesPercentage = _feesPercentage;
        FeeInstalled(feesPercentage);
        if (feesPercentage > 0) {
            feeManager = FeeManager(_feeManager);
            // 50 % fee is excessive
            require(feesPercentage * 2 < 1 ether);
            feeManager.create(feesPercentage, admins);
        }

        if (msg.value > 0) {
            deposit();
        }
    }

    function version() public returns (uint, uint, uint) {
        return (1, 0, 0);
    }

    function fail() external onlyAdmins onState(State.Open) {
        changeState(State.Failed);
    }

    function payToPresale(address _presaleAddress, uint minPoolBalance) external onlyAdmins onState(State.Open) {
        require(poolBalance >= minPoolBalance);
        changeState(State.Paid);
        presaleAddress = _presaleAddress;
        if (feesPercentage > 0) {
            totalFees = (poolBalance * feesPercentage) / 1 ether;
        }
        require(
            presaleAddress.call.value(poolBalance - totalFees)()
        );
    }

    function refundPresale() payable external onState(State.Paid) {
        require(msg.value >= poolBalance);
        require(msg.sender == presaleAddress || isAdmin(msg.sender));
        gasFundBalance = msg.value - poolBalance;
        changeState(State.Failed);
    }

    function transferFees() public onState(State.TokensReady) {
        require(totalFees > 0);
        uint amount = totalFees;
        totalFees = 0;
        require(
            (address(feeManager)).call.value(amount)()
        );
    }

    function transferAndDistributeFees() external {
        transferFees();
        feeManager.distrbuteFees(admins);
    }

    function setToken(address tokenAddress) external onlyAdmins onState(State.Paid) {
        token = ERC20(tokenAddress);
        uint tokenBalance = token.balanceOf(address(this));
        require(tokenBalance > 0);
        TokensReceived(tokenAddress, tokenBalance);
        changeState(State.TokensReady);
    }

    function deposit() payable public onState(State.Open) {
        require(msg.value > 0);
        require(included(msg.sender));

        uint newContribution;
        uint newRemaining;
        (newContribution, newRemaining) = getContribution(msg.sender, msg.value);
        // must respect the maxContribution and maxPoolBalance limits
        require(newRemaining == 0);

        var balance = balances[msg.sender];
        poolBalance = poolBalance - balance.contribution + newContribution;
        (balance.contribution, balance.remaining) = (newContribution, newRemaining);

        if (!balance.exists) {
            balance.whitelisted = true;
            balance.exists = true;
            participants.push(msg.sender);
        }
        Deposit(msg.sender, msg.value, poolBalance);
    }

    function withdrawAll() external {
        var balance = balances[msg.sender];
        uint total = balance.remaining;
        balance.remaining = 0;

        if (state == State.Open || state == State.Failed) {
            total += balance.contribution;
            if (gasFundBalance > 0) {
                uint gasRefund = (balance.contribution * gasFundBalance) / (poolBalance);
                gasFundBalance -= gasRefund;
                total += gasRefund;
            }
            poolBalance -= balance.contribution;
            balance.contribution = 0;
        }

        Withdrawl(msg.sender, total, 0, 0, poolBalance);
        require(
            msg.sender.call.value(total)()
        );
    }

    function withdraw(uint amount) external onState(State.Open) {
        var balance = balances[msg.sender];
        uint total = balance.remaining + balance.contribution;
        require(total >= amount && amount >= balance.remaining);

        uint debit = amount - balance.remaining;
        balance.remaining = 0;
        if (debit > 0) {
            balance.contribution -= debit;
            poolBalance -= debit;
            require(balance.contribution >= minContribution);
        }

        Withdrawl(
            msg.sender,
            amount,
            balance.remaining,
            balance.contribution,
            poolBalance
        );
        require(
            msg.sender.call.value(amount)()
        );
    }

    function transferMyTokens() external onState(State.TokensReady) {
        uint tokenBalance = token.balanceOf(address(this));
        transferTokensToRecipient(msg.sender, tokenBalance);
    }

    function transferAllTokens() external onlyAdmins onState(State.TokensReady) {
        transferTokensToRecipients(participants);
    }

    function transferTokensTo(address[] recipients) external onlyAdmins onState(State.TokensReady) {
        transferTokensToRecipients(recipients);
    }

    function modifyWhitelist(address[] toInclude, address[] toExclude) external onlyAdmins onState(State.Open) {
        if (!restricted) {
            WhitelistEnabled();
            restricted = true;
        }

        for (uint i = 0; i < toExclude.length; i++) {
            address participant = toExclude[i];
            var balance = balances[participant];

            if (balance.whitelisted) {
                balance.whitelisted = false;
                RemovedFromWhitelist(participant);

                if (balance.contribution > 0) {
                    poolBalance -= balance.contribution;
                    balance.remaining += balance.contribution;
                    balance.contribution = 0;
                    ContributionAdjusted(
                        participant,
                        balance.remaining,
                        balance.contribution,
                        poolBalance
                    );
                }
            }
        }

        includeInWhitelist(toInclude);
    }

    function removeWhitelist() external onlyAdmins onState(State.Open) {
        require(restricted);
        restricted = false;
        WhitelistDisabled();

        includeInWhitelist(participants);
    }

    function setContributionSettings(uint _minContribution, uint _maxContribution, uint _maxPoolBalance) external onlyAdmins onState(State.Open) {
        // we raised the minContribution threshold
        bool recompute = (minContribution < _minContribution);
        // we lowered the maxContribution threshold
        recompute = recompute || (maxContribution > _maxContribution);
        // we did not have a maxContribution threshold and now we do
        recompute = recompute || (maxContribution == 0 && _maxContribution > 0);
        // we want to make maxPoolBalance lower than the current pool balance
        recompute = recompute || (poolBalance > _maxPoolBalance);

        minContribution = _minContribution;
        maxContribution = _maxContribution;
        maxPoolBalance = _maxPoolBalance;

        validateContributionSettings();
        ContributionSettingsChanged(minContribution, maxContribution, maxPoolBalance);

        if (recompute) {
            poolBalance = 0;
            for (uint i = 0; i < participants.length; i++) {
                var participant = participants[i];
                var balance = balances[participant];
                uint oldContribution = balance.contribution;
                (balance.contribution, balance.remaining) = getContribution(participant, 0);
                poolBalance += balance.contribution;

                if (oldContribution != balance.contribution) {
                    ContributionAdjusted(
                        participant,
                        balance.remaining,
                        balance.contribution,
                        poolBalance
                    );
                }
            }
        }
    }

    function getParticipantBalances() external constant returns(address[], uint[], uint[], bool[], bool[]) {
        uint[] memory contribution = new uint[](participants.length);
        uint[] memory remaining = new uint[](participants.length);
        bool[] memory whitelisted = new bool[](participants.length);
        bool[] memory exists = new bool[](participants.length);

        for (uint i = 0; i < participants.length; i++) {
            var balance = balances[participants[i]];
            contribution[i] = balance.contribution;
            remaining[i] = balance.remaining;
            whitelisted[i] = balance.whitelisted;
            exists[i] = balance.exists;
        }

        return (participants, contribution, remaining, whitelisted, exists);
    }

    function includeInWhitelist(address[] toInclude) internal {
        for (uint i = 0; i < toInclude.length; i++) {
            var participant = toInclude[i];
            var balance = balances[participant];

            if (!balance.whitelisted) {
                balance.whitelisted = true;
                IncludedInWhitelist(participant);

                if (balance.remaining > 0) {
                    (balance.contribution, balance.remaining) = getContribution(participant, 0);
                    if (balance.contribution > 0) {
                        poolBalance += balance.contribution;
                        ContributionAdjusted(
                            participant,
                            balance.remaining,
                            balance.contribution,
                            poolBalance
                        );
                    }
                }
            }
        }
    }

    function changeState(State desiredState) internal {
        StateChange(state, desiredState);
        state = desiredState;
    }

    function transferTokensToRecipients(address[] recipients) internal {
        uint tokenBalance = token.balanceOf(address(this));

        for (uint i = 0; i < recipients.length; i++) {
            tokenBalance = transferTokensToRecipient(recipients[i], tokenBalance);

            if (tokenBalance == 0) {
                break;
            }
        }
    }

    function transferTokensToRecipient(address recipient, uint tokenBalance) internal noReentrancy returns(uint) {
        var balance = balances[recipient];

        if (balance.contribution > 0) {
            uint share = balance.contribution * tokenBalance / poolBalance;

            bool succeeded = token.transfer(recipient, share);
            if (succeeded) {
                // it's safe to perform these updates after calling token.transfer()
                // because we have a noReentrancy modifier on this function
                poolBalance -= balance.contribution;
                tokenBalance -= share;
                balance.contribution = 0;
            }
            TokenTransfer(recipient, share, succeeded, tokenBalance);
        }
        return tokenBalance;
    }

    function validateContributionSettings() internal constant {
        if (maxContribution > 0) {
            require(maxContribution >= minContribution);
        }
        if (maxPoolBalance > 0) {
            require(maxPoolBalance >= minContribution);
            require(maxPoolBalance >= maxContribution);
        }
    }

    function isAdmin(address addr) internal constant returns (bool) {
        for (uint i = 0; i < admins.length; i++) {
            if (admins[i] == addr) {
                return true;
            }
        }
        return false;
    }

    function included(address participant) internal constant returns (bool) {
        return !restricted || balances[participant].whitelisted;
    }

    function getContribution(address participant, uint amount) internal constant returns (uint, uint) {
        var balance = balances[participant];
        uint total = balance.remaining + balance.contribution + amount;
        uint contribution = total;
        if (!included(participant)) {
            return (0, total);
        }
        if (maxContribution > 0) {
            contribution = min(maxContribution, contribution);
        }
        if (maxPoolBalance > 0) {
            contribution = min(maxPoolBalance - poolBalance, contribution);
        }
        if (contribution < minContribution) {
            return (0, total);
        }
        return (contribution, total - contribution);
    }

    function min(uint a, uint b) internal pure returns (uint _min) {
        if (a < b) {
            return a;
        }
        return b;
    }
}