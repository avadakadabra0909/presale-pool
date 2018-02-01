pragma solidity 0.4.19;


contract PoolRegistry {

    event NewContract(
        address indexed _contractCreator,
        uint256 indexed _code,
        address _contractAddress
    );

    function register(address contractCreator, uint256 code) external {
        require(contractCreator != msg.sender);
        NewContract(contractCreator, code, msg.sender);
    }
}