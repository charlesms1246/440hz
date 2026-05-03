import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Deploys ZKSettlementVerifier with placeholder VK (all zeros).
 *
 * The oracle path on TrainingEscrow is NOT changed by this deployment.
 * Only call TrainingEscrow.setOracle(zkVerifier.address) once the ZK path is
 * confirmed working end-to-end with real compiled circuits.
 *
 * To update VK after circuit compilation:
 *   1. Start the ZK server: cd 0g-zk-settlement-server && node src/server.js
 *   2. Fetch: GET http://localhost:3000/batch-verifier-contract
 *   3. Extract VK constants from the rendered Solidity
 *   4. Call ZKSettlementVerifier.updateVK([...vk14], [...vkGammaABC], 0)
 *
 * Deploy:
 *   npx hardhat ignition deploy ignition/modules/DeployZKSettlement.ts --network galileo
 */

const ESCROW_ADDRESS = "0x558298297E714312D5670dBe4dbc15E1D240a811";

// Placeholder VK — proof verification always fails until replaced with real values.
const PLACEHOLDER_VK: [
  bigint, bigint, bigint, bigint, bigint, bigint, bigint,
  bigint, bigint, bigint, bigint, bigint, bigint, bigint
] = [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];

// vkGammaABC: 2*(numPublicInputs+1) elements. Circuit has 5 public inputs → 12 elements.
// All zeros until real VK is set.
const PLACEHOLDER_GAMMA_ABC: bigint[] = new Array(12).fill(0n);

// Circuit encodes jobId (nonce) as public_signals[0].
const JOB_ID_SIGNAL_INDEX = 0n;

export default buildModule("DeployZKSettlement", (m) => {
  const zkVerifier = m.contract("ZKSettlementVerifier", [
    ESCROW_ADDRESS,
    PLACEHOLDER_VK,
    PLACEHOLDER_GAMMA_ABC,
    JOB_ID_SIGNAL_INDEX,
  ]);

  return { zkVerifier };
});
