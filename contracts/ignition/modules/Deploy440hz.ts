import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("Deploy440hz", (m) => {
  const deployer = m.getAccount(0);

  // Treasury and oracle start as the deployer EOA.
  // Update after deploy: setTreasury(safeAddr), setOracle(executorTeeAddr)
  const marketplace = m.contract("GymMarketplace", [deployer]);

  const escrow = m.contract("TrainingEscrow", [
    marketplace,  // IGymMarketplace
    deployer,     // oracle
    deployer,     // treasury
  ]);

  // Wire TrainingEscrow into GymMarketplace so creditRoyalty is authorised
  m.call(marketplace, "setEscrow", [escrow], { id: "setEscrow" });

  return { marketplace, escrow };
});
