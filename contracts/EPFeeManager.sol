pragma solidity ^0.4.15;


contract EPFeeManager {
    struct Fees {
        mapping (address => bool) claimed;
        mapping (address => bool) isRecipient;
        address[] recipients;
        uint numerator;
        uint denominator;
        uint amount;
        bool exists;
    }
    mapping (address => Fees) public feesForContract;
    address[] public epTeam;
    mapping (address => uint) public teamBalances;
    uint public teamTotalBalance;

    function EPFeeManager(address[] _epTeam) payable {
        require(_epTeam.length > 0);
        for (uint i = 0; i < _epTeam.length; i++) {
            var addr = _epTeam[i];
            if (!inTeam(addr)) {
                epTeam.push(addr);
            }
        }
        teamTotalBalance = msg.value;
    }

    function () payable {
        require(msg.value > 0);
        var fees = feesForContract[msg.sender];
        require(fees.exists);
        require(fees.amount == 0);
        fees.amount = msg.value;

        uint recipientsShare = fees.recipients.length * ((fees.numerator * fees.amount) / fees.denominator);
        teamTotalBalance += fees.amount - recipientsShare;
    }

    function claimFees(address contractAddress) external {
        var fees = feesForContract[contractAddress];
        require(fees.amount > 0);
        require(fees.isRecipient[msg.sender] && !fees.claimed[msg.sender]);

        uint share = (fees.numerator * fees.amount) / fees.denominator;
        fees.claimed[msg.sender] = true;

        require(
            msg.sender.call.value(share)()
        );
    }

    function distrbuteFees() external {
        var fees = feesForContract[msg.sender];
        require(fees.amount > 0);

        uint share = (fees.numerator * fees.amount) / fees.denominator;

        for (uint i = 0; i < fees.recipients.length; i++) {
            var recipient = fees.recipients[i];
            if (!fees.claimed[recipient]) {
                fees.claimed[recipient] = true;
                require(
                    recipient.call.value(share)()
                );
            }
        }
    }

    function claimTeamMemberFees() external {
        uint amount = teamBalances[msg.sender];
        teamBalances[msg.sender] = 0;
        require(
            msg.sender.call.value(amount)()
        );
    }

    function splitTeamFees() public {
        bool isTeamMember = false;
        uint sharePerMember = teamTotalBalance / epTeam.length;
        for (uint i = 0; i < epTeam.length; i++) {
            isTeamMember = isTeamMember || msg.sender == epTeam[i];
            teamBalances[epTeam[i]] += sharePerMember;
            teamTotalBalance -= sharePerMember;
        }
        require(isTeamMember);
    }

    function splitAndDistributeTeamFees() external {
        splitTeamFees();
        for (uint i = 0; i < epTeam.length; i++) {
            address member = epTeam[i];
            uint amount = teamBalances[member];
            teamBalances[member] = 0;
            require(
                member.call.value(amount)()
            );
        }
    }

    function create(uint _feesPercentage, address[] _feeRecipients) external {
        require(_feesPercentage > 0);
        require(_feeRecipients.length > 0);
        // 50 % fee is excessive
        require(_feesPercentage * 2 < 1 ether);
        var fees = feesForContract[msg.sender];
        require(!fees.exists);

        fees.exists = true;

        // EP team will get at most 1%
        uint teamPercentage = min(
            _feesPercentage / (_feeRecipients.length + 1),
            1 ether / 100
        );
        fees.numerator = (_feesPercentage - teamPercentage) / _feeRecipients.length;
        fees.denominator = _feesPercentage;
        require(fees.numerator <= fees.denominator);

        for (uint i = 0; i < _feeRecipients.length; i++) {
            address recipient = _feeRecipients[i];
            fees.isRecipient[recipient] = true;
            fees.recipients.push(recipient);
        }
    }

    function inTeam(address addr) internal constant returns (bool) {
        for (uint i = 0; i < epTeam.length; i++) {
            if (epTeam[i] == addr) {
                return true;
            }
        }
        return false;
    }

    function min(uint a, uint b) internal pure returns (uint _min) {
        if (a < b) {
            return a;
        }
        return b;
    }
}