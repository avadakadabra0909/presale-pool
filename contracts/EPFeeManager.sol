pragma solidity ^0.4.15;


contract EPFeeManager {
    struct Fees {
        mapping (address => bool) claimed;
        mapping (address => bool) isRecipient;
        address[] recipients;
        uint percentagePerRecipient;
        uint amount;
        bool exists;
    }
    mapping (address => Fees) feesForContract;
    address[] epTeam;
    mapping (address => uint) teamBalances;
    uint teamTotalBalance;

    function EPFeeManager(address[] _epTeam) payable {
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
        uint recipientsShare = (fees.recipients.length * fees.amount * fees.percentagePerRecipient) / 1 ether;
        teamTotalBalance += fees.amount - recipientsShare;
    }

    function claimFees(address contractAddress) public {
        var fees = feesForContract[contractAddress];
        require(fees.amount > 0);
        require(fees.isRecipient[msg.sender] && !fees.claimed[msg.sender]);

        uint share = (fees.amount * fees.percentagePerRecipient) / 1 ether;
        fees.claimed[msg.sender] = true;

        msg.sender.transfer(share);
    }

    function distrbuteFees() public {
        var fees = feesForContract[msg.sender];
        require(fees.amount > 0);

        uint share = (fees.amount * fees.percentagePerRecipient) / 1 ether;

        for (uint i = 0; i < fees.recipients.length; i++) {
            var recipient = fees.recipients[i];
            if (!fees.claimed[recipient]) {
                fees.claimed[recipient] = true;
                recipient.transfer(share);
            }
        }
    }

    function claimTeamMemberFees() public {
        uint amount = teamBalances[msg.sender];
        teamBalances[msg.sender] = 0;
        msg.sender.transfer(amount);
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

    function splitAndDistributeTeamFees() public {
        splitTeamFees();
        for (uint i = 0; i < epTeam.length; i++) {
            address member = epTeam[i];
            uint amount = teamBalances[member];
            teamBalances[member] = 0;
            member.transfer(amount);
        }
    }

    function create(uint _feesPercentage, address[] _feeRecipients) public {
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
        uint recipientShare = (_feesPercentage - teamPercentage) / (_feeRecipients.length * _feesPercentage);

        for (uint i = 0; i < _feeRecipients.length; i++) {
            address recipient = _feeRecipients[i];
            fees.isRecipient[recipient] = true;
            fees.recipients.push(recipient);
        }
        fees.percentagePerRecipient = recipientShare;
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