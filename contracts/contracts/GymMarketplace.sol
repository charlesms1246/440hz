// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/I440hz.sol";

contract GymMarketplace is Ownable, ReentrancyGuard {
    uint256 public platformFeeBps = 500; // 5 %
    address public treasury;
    address public escrow;

    // rootHashKey → keccak256(abi.encodePacked(rawRootHashString))
    mapping(bytes32 => IGymMarketplace.Listing) private _listings;
    mapping(address => mapping(bytes32 => bool)) private _access;
    bytes32[] private _keys;             // insertion-ordered; newest-first via reverse iteration
    mapping(address => uint256) private _royalties;

    event GymListed(bytes32 indexed rootHashKey, address indexed seller, uint256 priceWei, string name);
    event GymPurchased(bytes32 indexed rootHashKey, address indexed buyer, uint256 paid);
    event GymDelisted(bytes32 indexed rootHashKey, address indexed seller);
    event RoyaltyClaimed(address indexed builder, uint256 amount);

    error AlreadyListed();
    error ListingNotActive();
    error AlreadyOwned();
    error InsufficientPayment();
    error NothingToClaim();
    error OnlyEscrow();
    error FeeTooHigh();
    error ValueMismatch();

    modifier onlyEscrow() {
        if (msg.sender != escrow) revert OnlyEscrow();
        _;
    }

    constructor(address _treasury) Ownable(msg.sender) {
        treasury = _treasury;
    }

    // ── Listing ───────────────────────────────────────────────────────

    function listGym(
        bytes32 rootHashKey,
        string calldata name,
        string calldata category,
        string calldata license,
        uint256 priceWei
    ) external {
        if (_listings[rootHashKey].active) revert AlreadyListed();
        _listings[rootHashKey] = IGymMarketplace.Listing({
            seller:   msg.sender,
            priceWei: priceWei,
            name:     name,
            category: category,
            license:  license,
            active:   true
        });
        _keys.push(rootHashKey);
        emit GymListed(rootHashKey, msg.sender, priceWei, name);
    }

    function delistGym(bytes32 rootHashKey) external {
        IGymMarketplace.Listing storage listing = _listings[rootHashKey];
        require(listing.active && listing.seller == msg.sender, "Not seller or inactive");
        listing.active = false;
        emit GymDelisted(rootHashKey, msg.sender);
    }

    // ── Purchase ──────────────────────────────────────────────────────

    function purchaseGym(bytes32 rootHashKey) external payable nonReentrant {
        IGymMarketplace.Listing storage listing = _listings[rootHashKey];
        if (!listing.active) revert ListingNotActive();
        // Revert only if the buyer has already explicitly purchased (or is the seller)
        if (msg.sender == listing.seller || _access[msg.sender][rootHashKey]) revert AlreadyOwned();

        _access[msg.sender][rootHashKey] = true;

        if (listing.priceWei > 0) {
            if (msg.value < listing.priceWei) revert InsufficientPayment();
            uint256 fee = (msg.value * platformFeeBps) / 10_000;
            payable(listing.seller).transfer(msg.value - fee);
            payable(treasury).transfer(fee);
        }

        emit GymPurchased(rootHashKey, msg.sender, msg.value);
    }

    // ── Access ────────────────────────────────────────────────────────

    function checkAccess(address buyer, bytes32 rootHashKey) public view returns (bool) {
        IGymMarketplace.Listing storage listing = _listings[rootHashKey];
        return listing.seller == buyer
            || listing.priceWei == 0
            || _access[buyer][rootHashKey];
    }

    // ── Reads ─────────────────────────────────────────────────────────

    function getListing(bytes32 rootHashKey) external view returns (IGymMarketplace.Listing memory) {
        return _listings[rootHashKey];
    }

    function getListingCount() external view returns (uint256) {
        return _keys.length;
    }

    /// @param offset  0-based, counted newest-first
    function getListings(uint256 offset, uint256 limit)
        external view
        returns (IGymMarketplace.Listing[] memory results, bytes32[] memory keys)
    {
        uint256 total = _keys.length;
        if (offset >= total || limit == 0) {
            return (new IGymMarketplace.Listing[](0), new bytes32[](0));
        }
        uint256 end = offset + limit > total ? total : offset + limit;
        uint256 count = end - offset;
        results = new IGymMarketplace.Listing[](count);
        keys = new bytes32[](count);
        for (uint256 i = 0; i < count; i++) {
            uint256 idx = total - 1 - (offset + i);
            keys[i] = _keys[idx];
            results[i] = _listings[_keys[idx]];
        }
    }

    // ── Royalties (credited by TrainingEscrow) ────────────────────────

    function creditRoyalty(address builder, uint256 amount) external payable onlyEscrow {
        if (msg.value != amount) revert ValueMismatch();
        _royalties[builder] += amount;
    }

    function claimRoyalties() external nonReentrant {
        uint256 amount = _royalties[msg.sender];
        if (amount == 0) revert NothingToClaim();
        _royalties[msg.sender] = 0;
        payable(msg.sender).transfer(amount);
        emit RoyaltyClaimed(msg.sender, amount);
    }

    function pendingRoyalties(address builder) external view returns (uint256) {
        return _royalties[builder];
    }

    // ── Admin ─────────────────────────────────────────────────────────

    function setEscrow(address _escrow) external onlyOwner {
        escrow = _escrow;
    }

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
    }

    function setPlatformFee(uint256 bps) external onlyOwner {
        if (bps > 1000) revert FeeTooHigh(); // max 10 %
        platformFeeBps = bps;
    }
}
