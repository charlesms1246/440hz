// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IL2Registry {
    function createSubnode(
        bytes32 node,
        string calldata label,
        address owner,
        bytes[] calldata data
    ) external returns (bytes32);

    function owner(bytes32 node) external view returns (address);
}

/// @title 440hz L2 Subname Registrar
/// @notice Issues subnames under 440hz.eth (e.g. alice.440hz.eth) on Base Sepolia.
/// @dev Deployed by 440hz admin. Must be approved via registry.addRegistrar() before use.
contract L2Registrar {
    IL2Registry public immutable registry;
    bytes32 public immutable baseNode;
    address public owner;

    event SubnameRegistered(string label, address indexed registrant, bytes32 node);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Unauthorized();
    error InvalidLabel();
    error AlreadyRegistered();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address _registry, bytes32 _baseNode) {
        registry = IL2Registry(_registry);
        baseNode = _baseNode;
        owner = msg.sender;
    }

    /// @notice Register a subname under 440hz.eth. Anyone can call this.
    /// @param label The subname label (e.g. "alice" for alice.440hz.eth)
    /// @param subOwner The address that will own this subname
    function register(string calldata label, address subOwner) external returns (bytes32 node) {
        if (bytes(label).length == 0) revert InvalidLabel();
        if (subOwner == address(0)) revert InvalidLabel();
        node = registry.createSubnode(baseNode, label, subOwner, new bytes[](0));
        emit SubnameRegistered(label, subOwner, node);
    }

    /// @notice Transfer admin ownership of this registrar
    function transferOwnership(address newOwner) external onlyOwner {
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
