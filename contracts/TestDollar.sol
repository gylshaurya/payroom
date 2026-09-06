// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Fixed-supply demonstration token, no financial value or redemption.
contract TestDollar {
    string public constant name = "Payroom Test Dollar";
    string public constant symbol = "pUSD";
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    event Transfer(address indexed from, address indexed to, uint256 value);
    constructor(address holder, uint256 supply) { totalSupply = supply; balanceOf[holder] = supply; emit Transfer(address(0), holder, supply); }
    function transfer(address to, uint256 amount) external returns (bool) {
        require(to != address(0) && balanceOf[msg.sender] >= amount, "Transfer not allowed");
        balanceOf[msg.sender] -= amount; balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount); return true;
    }
}
