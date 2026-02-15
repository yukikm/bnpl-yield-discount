// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice TIP-20 is Tempo's native stablecoin standard. In the EVM, it behaves like an ERC-20.
interface ITIP20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

