pragma solidity 0.4.19;

import "./Util.sol";
import "./Fraction.sol";
import "./QuotaTracker.sol";

interface ERC20 {
    function transfer(address _to, uint _value) public returns (bool success);
    function balanceOf(address _owner) public constant returns (uint balance);
}

contract PBFeeManager {
    using Fraction for uint[2];
    using QuotaTracker for QuotaTracker.Data;

    struct Fees {
        uint[2] recipientFraction;
        address recipient;
        uint amount;
        bool claimed;
    }
    mapping (address => Fees) public feesForContract;
    uint public outstandingFeesBalance;

    address[] public teamMembers;
    QuotaTracker.Data public teamBalances;
    mapping(address => QuotaTracker.Data) public teamTokenBalances;

    uint public minTeamFee;
    uint public maxTeamFee;

    function PBFeeManager(address[] _teamMembers, uint _minTeamFee, uint _maxTeamFee) public payable {
        require(_teamMembers.length > 0);
        for (uint i = 0; i < _teamMembers.length; i++) {
            address addr = _teamMembers[i];
            if (!Util.contains(teamMembers, addr)) {
                teamMembers.push(addr);
            }
        }
        require(_minTeamFee <= _maxTeamFee && _maxTeamFee <= 1 ether);
        minTeamFee = _minTeamFee;
        maxTeamFee = _maxTeamFee;
    }

    function () public payable {}

    function sendFees() external payable returns(uint) {
        require(msg.value > 0);
        Fees storage fees = feesForContract[msg.sender];
        // require that fees haven't already been collected
        require(fees.amount == 0);
        // require that fees is initialized
        require(fees.recipientFraction[1] > 0);

        fees.amount = msg.value;

        uint recipientShare = fees.recipientFraction.shareOf(fees.amount);
        outstandingFeesBalance += recipientShare;
        return recipientShare;
    }

    function distributeFees(address contractAddress) external {
        Fees storage fees = feesForContract[contractAddress];
        require(fees.amount > 0);
        require(!fees.claimed);

        fees.claimed = true;
        uint share = fees.recipientFraction.shareOf(fees.amount);
        if (share > 0) {
            outstandingFeesBalance -= share;

            require(
                fees.recipient.call.value(share)()
            );
        }
    }

    function claimMyTeamFees() external {
        require(Util.contains(teamMembers, msg.sender));
        sendFeesToMember(msg.sender);
    }

    function distributeTeamFees() external {
        bool calledByTeamMember = false;
        for (uint i = 0; i < teamMembers.length; i++) {
            address member = teamMembers[i];
            calledByTeamMember = calledByTeamMember || msg.sender == member;
            sendFeesToMember(member);
        }
        require(calledByTeamMember);
    }

    function claimMyTeamTokens(address tokenAddress) external {
        require(Util.contains(teamMembers, msg.sender));
        QuotaTracker.Data storage trackerForToken = teamTokenBalances[tokenAddress];
        ERC20 tokenContract = ERC20(tokenAddress);
        sendTokensToMember(trackerForToken, tokenContract, msg.sender);
    }

    function distributeTeamTokens(address tokenAddress) external {
        bool calledByTeamMember = false;
        QuotaTracker.Data storage trackerForToken = teamTokenBalances[tokenAddress];
        ERC20 tokenContract = ERC20(tokenAddress);

        for (uint i = 0; i < teamMembers.length; i++) {
            address member = teamMembers[i];
            calledByTeamMember = calledByTeamMember || msg.sender == member;
            sendTokensToMember(trackerForToken, tokenContract, member);
        }
        require(calledByTeamMember);
    }

    function create(uint recipientFeesPerEther, address recipient) external returns(uint) {
        // 50 % fee is excessive
        require(recipientFeesPerEther * 2 < 0.99 ether);

        Fees storage fees = feesForContract[msg.sender];
        // require that fees is uninitialized
        require(fees.recipientFraction[1] == 0);

        // PrimaBlock team will get at most maxTeamFee per ether
        // and at least minTeamFee per ether
        uint teamFeesPerEther = Util.max(
            Util.min(
                recipientFeesPerEther / 2,
                maxTeamFee
            ),
            minTeamFee
        );

        fees.recipient = recipient;
        fees.recipientFraction = [
            // numerator
            recipientFeesPerEther,
            // denominator
            recipientFeesPerEther + teamFeesPerEther
        ];

        return recipientFeesPerEther + teamFeesPerEther;
    }

    function getTotalFeesPerEther() view external returns(uint) {
        Fees storage fees = feesForContract[msg.sender];
        return fees.recipientFraction[1];
    }

    function discountFees(address member, uint recipientFeesPerEther, uint teamFeesPerEther) external {
        require(Util.contains(teamMembers, member));
        Fees storage fees = feesForContract[msg.sender];
        // require that fees haven't already been collected
        require(fees.amount == 0);
        // require that fees is initialized
        require(fees.recipientFraction[1] > 0);

        require(recipientFeesPerEther <= fees.recipientFraction[1]);
        require(teamFeesPerEther <= fees.recipientFraction[1]);

        uint denominator = recipientFeesPerEther + teamFeesPerEther;
        require(denominator <= fees.recipientFraction[1]);

        fees.recipientFraction = [
            // numerator
            recipientFeesPerEther,
            denominator
        ];
    }

    // used only for tests
    function getFees(address contractAddress) public constant returns(uint, uint, address, uint) {
        Fees storage fees = feesForContract[contractAddress];
        return (
            fees.recipientFraction[0],
            fees.recipientFraction[1],
            fees.recipient,
            fees.amount
        );
    }

    function sendFeesToMember(address member) internal {
        uint share = teamBalances.claimShare(
            member,
            this.balance - outstandingFeesBalance,
            [1, teamMembers.length]
        );

        require(
            member.call.value(share)()
        );
    }

    function sendTokensToMember(QuotaTracker.Data storage trackerForToken, ERC20 tokenContract, address member) internal {
        uint share = trackerForToken.claimShare(
            member,
            tokenContract.balanceOf(address(this)),
            [1, teamMembers.length]
        );

        if (!tokenContract.transfer(member, share)) {
            trackerForToken.undoClaim(member, share);
        }
    }
}
