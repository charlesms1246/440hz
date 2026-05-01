// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/I440hz.sol";

contract TrainingEscrow is Ownable, ReentrancyGuard {
    // 0.001 0G per episode base cost
    uint256 public constant BASE_COST_WEI = 0.001 ether;

    // Split basis points (must sum to 10_000)
    uint256 public providerShareBps = 8000; // 80 %
    uint256 public royaltyShareBps  = 1000; // 10 %
    // platform treasury receives the remaining 10 %

    IGymMarketplace public marketplace;
    address public oracle;
    address public treasury;

    enum Status { Pending, Completed, Refunded }

    struct Job {
        address creator;
        address provider;
        bytes32 gymRootHashKey;
        uint256 depositWei;
        Status  status;
    }

    mapping(bytes32 => Job) public jobs;

    event JobDeposited(bytes32 indexed jobId, address indexed creator, address indexed provider, uint256 depositWei);
    event JobCompleted(bytes32 indexed jobId, address indexed provider, uint256 providerShare, uint256 royaltyShare);
    event JobRefunded(bytes32 indexed jobId, address indexed creator, uint256 refundAmount);

    error JobAlreadyExists();
    error JobNotFound();
    error JobNotPending();
    error InvalidProvider();
    error DepositRequired();
    error OnlyOracle();
    error RoyaltyTransferFailed();

    modifier onlyOracle() {
        if (msg.sender != oracle) revert OnlyOracle();
        _;
    }

    constructor(address _marketplace, address _oracle, address _treasury) Ownable(msg.sender) {
        marketplace = IGymMarketplace(_marketplace);
        oracle      = _oracle;
        treasury    = _treasury;
    }

    // ── Cost estimation ───────────────────────────────────────────────

    /// Returns cost in wei.
    /// loraRank multiplier: max(1, loraRank/16) — so rank < 16 costs the same as rank 16.
    function estimateCost(uint32 numEpisodes, uint8 loraRank) public pure returns (uint256) {
        uint256 rankMul = loraRank >= 16 ? uint256(loraRank) / 16 : 1;
        return BASE_COST_WEI * uint256(numEpisodes) * rankMul;
    }

    // ── Job lifecycle ─────────────────────────────────────────────────

    function depositJob(
        bytes32 jobId,
        address provider,
        bytes32 gymRootHashKey
    ) external payable {
        if (jobs[jobId].creator != address(0)) revert JobAlreadyExists();
        if (provider == address(0)) revert InvalidProvider();
        if (msg.value == 0) revert DepositRequired();

        jobs[jobId] = Job({
            creator:        msg.sender,
            provider:       provider,
            gymRootHashKey: gymRootHashKey,
            depositWei:     msg.value,
            status:         Status.Pending
        });

        emit JobDeposited(jobId, msg.sender, provider, msg.value);
    }

    /// Called by oracle once the executor confirms a training job finished.
    /// Splits deposit: provider 80 %, gym builder 10 %, treasury 10 %.
    function completeJob(bytes32 jobId) external onlyOracle nonReentrant {
        Job storage job = jobs[jobId];
        if (job.creator == address(0)) revert JobNotFound();
        if (job.status != Status.Pending) revert JobNotPending();

        job.status = Status.Completed;

        uint256 deposit       = job.depositWei;
        uint256 providerShare = (deposit * providerShareBps) / 10_000;
        uint256 royaltyShare  = (deposit * royaltyShareBps) / 10_000;
        uint256 platformShare = deposit - providerShare - royaltyShare;

        payable(job.provider).transfer(providerShare);
        payable(treasury).transfer(platformShare);

        // Credit the gym builder their royalty via marketplace.
        // If no gym listing exists (gymRootHashKey == 0 or seller == 0), royalty goes to treasury.
        IGymMarketplace.Listing memory listing = marketplace.getListing(job.gymRootHashKey);
        if (listing.seller != address(0) && royaltyShare > 0) {
            marketplace.creditRoyalty{value: royaltyShare}(listing.seller, royaltyShare);
        } else {
            payable(treasury).transfer(royaltyShare);
        }

        emit JobCompleted(jobId, job.provider, providerShare, royaltyShare);
    }

    /// Called by oracle to refund a failed or cancelled job to the creator.
    function refundJob(bytes32 jobId) external onlyOracle nonReentrant {
        Job storage job = jobs[jobId];
        if (job.creator == address(0)) revert JobNotFound();
        if (job.status != Status.Pending) revert JobNotPending();

        job.status = Status.Refunded;
        uint256 amount = job.depositWei;
        payable(job.creator).transfer(amount);

        emit JobRefunded(jobId, job.creator, amount);
    }

    // ── Admin ─────────────────────────────────────────────────────────

    function setOracle(address _oracle) external onlyOwner {
        oracle = _oracle;
    }

    function setMarketplace(address _marketplace) external onlyOwner {
        marketplace = IGymMarketplace(_marketplace);
    }

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
    }
}
