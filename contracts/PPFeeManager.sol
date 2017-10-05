pragma solidity ^0.4.15;

import "./Util.sol";
import "./Fraction.sol";

contract PPFeeManager {
    using Fraction for uint[2];

    struct Fees {
        mapping (address => bool) claimed;
        mapping (address => bool) isRecipient;
        uint[2] recipientFraction;
        uint numRecipients;
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
            address addr = _teamMembers[i];
            if (!Util.contains(teamMembers, addr)) {
                teamMembers.push(addr);
            }
        }
        teamTotalBalance = msg.value;
    }

    function () payable {
        require(msg.value > 0);
        Fees storage fees = feesForContract[msg.sender];
        require(fees.exists);
        require(fees.amount == 0);
        fees.amount = msg.value;

        uint recipientShare = fees.recipientFraction.shareOf(fees.amount);
        teamTotalBalance += fees.amount - fees.numRecipients * recipientShare;
    }

    // used only for tests
    function getFees(address contractAddress) public returns(uint, uint, uint, uint, bool) {
        Fees storage fees = feesForContract[contractAddress];
        return (
            fees.recipientFraction[0],
            fees.recipientFraction[1],
            fees.numRecipients,
            fees.amount,
            fees.exists
        );
    }

    function claimFees(address contractAddress) external {
        Fees storage fees = feesForContract[contractAddress];
        require(fees.amount > 0);
        require(fees.isRecipient[msg.sender] && !fees.claimed[msg.sender]);

        uint share = fees.recipientFraction.shareOf(fees.amount);
        fees.claimed[msg.sender] = true;

        require(
            msg.sender.call.value(share)()
        );
    }

    function distrbuteFees(address[] recipients) external {
        Fees storage fees = feesForContract[msg.sender];
        require(fees.amount > 0);

        uint share = fees.recipientFraction.shareOf(fees.amount);

        for (uint i = 0; i < recipients.length; i++) {
            address recipient = recipients[i];
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
            address teamMember = teamMembers[i];
            isTeamMember = isTeamMember || msg.sender == teamMember;
            teamBalances[teamMember] += sharePerMember;
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

    function create(uint feesPerEther, address[] recipients) external {
        require(feesPerEther > 0);
        // 50 % fee is excessive
        require(feesPerEther * 2 < 1 ether);
        require(recipients.length > 0 && recipients.length < 5);

        Fees storage fees = feesForContract[msg.sender];
        require(!fees.exists);

        fees.exists = true;

        // EP team will get at most 1%
        uint teamPercentage = Util.min(
            feesPerEther / (recipients.length + 1),
            1 ether / 100
        );

        fees.recipientFraction = [
            (feesPerEther - teamPercentage) / recipients.length, // numerator
            feesPerEther // denominator
        ];
        fees.numRecipients = recipients.length;
        require(fees.recipientFraction[0] + teamPercentage <= fees.recipientFraction[1]);

        for (uint i = 0; i < recipients.length; i++) {
            address recipient = recipients[i];
            require(!fees.isRecipient[recipient]);
            fees.isRecipient[recipient] = true;
        }
    }
}