pragma solidity ^0.4.15;

import "./Util.sol";
import "./Fraction.sol";
import "./QuotaTracker.sol";

contract PPFeeManager {
    using Fraction for uint[2];
    using QuotaTracker for QuotaTracker.Data;

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
    QuotaTracker.Data teamBalances;
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

    function () public payable {
        require(msg.value > 0);
        Fees storage fees = feesForContract[msg.sender];
        require(fees.exists);
        require(fees.amount == 0);
        fees.amount = msg.value;

        uint recipientShare = fees.recipientFraction.shareOf(fees.amount);
        teamTotalBalance += fees.amount - fees.numRecipients * recipientShare;
    }

    // used only for tests
    function getFees(address contractAddress) public constant returns(uint, uint, uint, uint, bool) {
        Fees storage fees = feesForContract[contractAddress];
        return (
            fees.recipientFraction[0],
            fees.recipientFraction[1],
            fees.numRecipients,
            fees.amount,
            fees.exists
        );
    }

    function claimMyFees(address contractAddress) external {
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

    function claimMyTeamFees() external {
        require(Util.contains(teamMembers, msg.sender));
        sendFeesForMember(msg.sender);
    }

    function distributeTeamFees() external {
        bool calledByTeamMember = false;
        for (uint i = 0; i < teamMembers.length; i++) {
            address member = teamMembers[i];
            calledByTeamMember = calledByTeamMember || msg.sender == member;
            sendFeesForMember(member);
        }
        require(calledByTeamMember);
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

    function sendFeesForMember(address member) internal {
        uint share = teamBalances.claimShare(
            member,
            teamTotalBalance,
            [1, teamMembers.length]
        );
        teamTotalBalance -= share;

        require(
            member.call.value(share)()
        );
    }
}