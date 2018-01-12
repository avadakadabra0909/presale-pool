pragma solidity ^0.4.15;


contract PoolRegistry {

    event NewContract(
        address indexed _contractCreator,
        uint256 indexed _code,
        address _contractAddress
    );

    function register(address contractCreator, uint256 code) external {
        NewContract(contractCreator, code, msg.sender);
    }
}