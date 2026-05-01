import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { namehash } from "viem";

// 440hz.eth L2 registry on Base Sepolia (deployed via Durin.dev)
const REGISTRY_ADDRESS = "0xbe9dfa62bba91781c204bd6b1b2e6513924f50a2";
const BASE_NODE = namehash("440hz.eth");

export default buildModule("DeployL2Registrar", (m) => {
  const registrar = m.contract("L2Registrar", [REGISTRY_ADDRESS, BASE_NODE]);

  // After deploy:
  // 1. Call registry.addRegistrar(registrar.address) from the registry owner wallet
  // 2. Update L2_REGISTRAR_ADDRESS in web/lib/utils/ensSubname.ts

  return { registrar };
});
