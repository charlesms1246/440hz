// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./BatchVerifier.sol";

interface ITrainingEscrowSettlement {
    function completeJob(bytes32 jobId) external;
}

/**
 * ZKSettlementVerifier — Groth16 bridge between the ZK settlement sidecar and TrainingEscrow.
 *
 * Deployment flow:
 *   1. Deploy with placeholder VK (zeros) — oracle path still works on TrainingEscrow.
 *   2. After circuits are compiled, call updateVK() with real constants from GET /batch-verifier-contract.
 *   3. Only after ZK path is confirmed working, call TrainingEscrow.setOracle(address(this)).
 *
 * Settlement flow:
 *   provider daemon → settle_job_zk() → POST /solidity-calldata-combined → settleWithProof()
 *   → BatchVerify() → escrow.completeJob()
 *
 * Public signals layout (must match circuit output order):
 *   signals[0] = jobId packed as uint256 (circuit nonce field)
 *   signals[1] = userAddress as uint256
 *   signals[2] = providerAddress as uint256
 *   signals[3] = reqFee
 *   signals[4] = resFee
 */
contract ZKSettlementVerifier is Ownable {
    ITrainingEscrowSettlement public escrow;

    // Groth16 verification key — set at deploy time, updatable by owner.
    // Populated from the compiled .zkey via GET /batch-verifier-contract on the ZK server.
    // Zeros = placeholder (proof verification will always fail until real VK is set).
    uint256[14] public vk;
    uint256[] public vkGammaABC;

    // Replay protection: once a jobId is settled here it cannot be resubmitted.
    mapping(bytes32 => bool) public settled;

    // Index of the jobId field in public_signals (circuit-dependent, default 0).
    uint256 public jobIdSignalIndex;

    event JobSettledWithProof(bytes32 indexed jobId);
    event VKUpdated();

    error AlreadySettled(bytes32 jobId);
    error ProofInvalid();
    error JobSignalMismatch(bytes32 jobId, uint256 signalValue);

    constructor(
        address _escrow,
        uint256[14] memory _vk,
        uint256[] memory _vkGammaABC,
        uint256 _jobIdSignalIndex
    ) Ownable(msg.sender) {
        escrow = ITrainingEscrowSettlement(_escrow);
        vk = _vk;
        vkGammaABC = _vkGammaABC;
        jobIdSignalIndex = _jobIdSignalIndex;
    }

    /**
     * Verify a Groth16 proof that the user and provider both signed this job,
     * then release the escrow for jobId.
     *
     * @param jobId         keccak256(toUtf8Bytes(task_id)) — matches depositJob() key
     * @param in_proof      8 * num_proofs uint256 values (Groth16 proof elements)
     * @param public_signals Public inputs to the circuit (see signal layout above)
     */
    function settleWithProof(
        bytes32 jobId,
        uint256[] calldata in_proof,
        uint256[] calldata public_signals
    ) external {
        if (settled[jobId]) revert AlreadySettled(jobId);

        uint256 jobIdAsUint = uint256(jobId);
        uint256 signalValue = public_signals[jobIdSignalIndex];
        if (jobIdAsUint != signalValue) revert JobSignalMismatch(jobId, signalValue);

        uint256[] memory signals = new uint256[](public_signals.length);
        for (uint256 i = 0; i < public_signals.length; i++) {
            signals[i] = public_signals[i];
        }

        bool valid = BatchVerifier.BatchVerify(vk, vkGammaABC, in_proof, signals, 1);
        if (!valid) revert ProofInvalid();

        settled[jobId] = true;
        emit JobSettledWithProof(jobId);
        escrow.completeJob(jobId);
    }

    // ── Admin ──────────────────────────────────────────────────────────────────

    function updateEscrow(address _escrow) external onlyOwner {
        escrow = ITrainingEscrowSettlement(_escrow);
    }

    function updateVK(
        uint256[14] calldata _vk,
        uint256[] calldata _vkGammaABC,
        uint256 _jobIdSignalIndex
    ) external onlyOwner {
        vk = _vk;
        vkGammaABC = _vkGammaABC;
        jobIdSignalIndex = _jobIdSignalIndex;
        emit VKUpdated();
    }
}
