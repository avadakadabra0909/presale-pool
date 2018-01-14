pragma solidity ^0.4.15;


contract PoolRegistry {

    event NewContract(
        address indexed _contractCreator,
        uint256 indexed _code,
        address _contractAddress
    );

    function register(uint256 code) external {
        require(tx.origin != msg.sender);
        NewContract(tx.origin, code, msg.sender);
    }
}