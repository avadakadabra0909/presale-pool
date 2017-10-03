pragma solidity ^0.4.15;


contract PPFeeManager {
    struct Fees {
        mapping (address => bool) claimed;
        mapping (address => bool) isRecipient;
        uint recipientNumerator;
        uint numRecipients;
        uint denominator;
        uint amount;
        bool exists;
    }
    mapping (address => Fees) public feesForContract;
    address[] public teamMembers;
    mapping (address => uint) public teamBalances;
    uint public teamTotalBalance;

    function PPFeeManager(address[] _teamMembers) payable {
        require(_teamMembers.length > 0);
        for (uint i = 0; i < _teamMembers.length; i++) {
            var addr = _teamMembers[i];
            if (!inTeam(addr)) {
                teamMembers.push(addr);
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

        uint recipientShare = (fees.recipientNumerator * fees.amount) / fees.denominator;
        teamTotalBalance += fees.amount - fees.numRecipients * recipientShare;
    }

    function claimFees(address contractAddress) external {
        var fees = feesForContract[contractAddress];
        require(fees.amount > 0);
        require(fees.isRecipient[msg.sender] && !fees.claimed[msg.sender]);

        uint share = (fees.recipientNumerator * fees.amount) / fees.denominator;
        fees.claimed[msg.sender] = true;

        require(
            msg.sender.call.value(share)()
        );
    }

    function distrbuteFees(address[] recipients) external {
        var fees = feesForContract[msg.sender];
        require(fees.amount > 0);

        uint share = (fees.recipientNumerator * fees.amount) / fees.denominator;

        for (uint i = 0; i < recipients.length; i++) {
            var recipient = recipients[i];
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
        uint sharePerMember = teamTotalBalance / teamMembers.length;
        for (uint i = 0; i < teamMembers.length; i++) {
            isTeamMember = isTeamMember || msg.sender == teamMembers[i];
            teamBalances[teamMembers[i]] += sharePerMember;
            teamTotalBalance -= sharePerMember;
        }
        require(isTeamMember);
    }

    function splitAndDistributeTeamFees() external {
        splitTeamFees();
        for (uint i = 0; i < teamMembers.length; i++) {
            address member = teamMembers[i];
            uint amount = teamBalances[member];
            teamBalances[member] = 0;
            require(
                member.call.value(amount)()
            );
        }
    }

    function create(uint feesPercentage, address[] recipients) external {
        require(feesPercentage > 0);
        require(recipients.length > 0);
        // 50 % fee is excessive
        require(feesPercentage * 2 < 1 ether);
        var fees = feesForContract[msg.sender];
        require(!fees.exists);

        fees.exists = true;

        // EP team will get at most 1%
        uint teamPercentage = min(
            feesPercentage / (recipients.length + 1),
            1 ether / 100
        );

        fees.recipientNumerator = (feesPercentage - teamPercentage) / recipients.length;
        fees.denominator = feesPercentage;
        fees.numRecipients = recipients.length;
        require(fees.recipientNumerator + teamPercentage <= fees.denominator);

        for (uint i = 0; i < recipients.length; i++) {
            address recipient = recipients[i];
            require(!fees.isRecipient[recipient]);
            fees.isRecipient[recipient] = true;
        }
    }

    function inTeam(address addr) internal constant returns (bool) {
        for (uint i = 0; i < teamMembers.length; i++) {
            if (teamMembers[i] == addr) {
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