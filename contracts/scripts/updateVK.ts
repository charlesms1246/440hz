// Updates ZKSettlementVerifier with the real verification key from the ZK server.
// Run after compiling circuits and restarting the ZK server:
//   $env:PRIVATE_KEY="<key>"; npx hardhat run scripts/updateVK.ts --network galileo
import { ethers } from "hardhat";

const ZK_SERVER = process.env.ZK_SERVER_URL ?? "http://localhost:3050";
const VERIFIER_ADDRESS = process.env.ZK_VERIFIER_ADDRESS ?? "0xD5F5f7DbcD8a51CBfF513749bC0Cc55fd5f10Bf2";

// Index of jobId in the circuit's public_signals array (0 = first signal).
const JOB_ID_SIGNAL_INDEX = 0n;

async function main() {
  console.log(`Fetching VK from ${ZK_SERVER}/vkey ...`);
  const res = await fetch(`${ZK_SERVER}/vkey`);
  if (!res.ok) throw new Error(`ZK server returned ${res.status} — is it running with compiled circuits?`);
  const vkey = await res.json();

  // snarkjs groth16 vkey field names
  const alpha = vkey.vk_alpha_1 as string[];
  const beta  = vkey.vk_beta_2  as string[][];
  const gamma = vkey.vk_gamma_2 as string[][];
  const delta = vkey.vk_delta_2 as string[][];
  const IC    = vkey.IC         as string[][];

  const vk14: bigint[] = [
    BigInt(alpha[0]), BigInt(alpha[1]),
    BigInt(beta[0][0]),  BigInt(beta[0][1]),  BigInt(beta[1][0]),  BigInt(beta[1][1]),
    BigInt(gamma[0][0]), BigInt(gamma[0][1]), BigInt(gamma[1][0]), BigInt(gamma[1][1]),
    BigInt(delta[0][0]), BigInt(delta[0][1]), BigInt(delta[1][0]), BigInt(delta[1][1]),
  ];

  const vkGammaABC: bigint[] = IC.flatMap((p) => [BigInt(p[0]), BigInt(p[1])]);

  const [signer] = await ethers.getSigners();
  console.log(`Signer: ${await signer.getAddress()}`);

  const abi = [
    "function updateVK(uint256[14] calldata _vk, uint256[] calldata _vkGammaABC, uint256 _jobIdSignalIndex) external",
  ];
  const verifier = new ethers.Contract(VERIFIER_ADDRESS, abi, signer);

  console.log(`Calling updateVK on ${VERIFIER_ADDRESS} ...`);
  const tx = await verifier.updateVK(vk14, vkGammaABC, JOB_ID_SIGNAL_INDEX);
  console.log(`Tx submitted: ${tx.hash}`);
  await tx.wait();
  console.log("VK updated successfully.");
}

main().catch((e) => { console.error(e); process.exit(1); });
