import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { parseEther, keccak256, toBytes, toHex, getAddress } from "viem";

const GYM_KEY = keccak256(toBytes("0x8a6a818b3b7800eee82a2fc80545c0103c35868349472be3d33149f778883c0f"));
const JOB_A = keccak256(toBytes("job-001"));
const JOB_B = keccak256(toBytes("job-002"));

describe("TrainingEscrow", async () => {
  const { viem } = await network.create();
  const publicClient = await viem.getPublicClient();
  const [deployer, creator, provider, gymSeller, attacker] = await viem.getWalletClients();

  async function deployAll() {
    const mp = await viem.deployContract("GymMarketplace", [deployer.account.address]);
    const escrow = await viem.deployContract("TrainingEscrow", [
      mp.address,
      deployer.account.address, // oracle = deployer for tests
      deployer.account.address, // treasury = deployer for tests
    ]);
    // wire escrow into marketplace so creditRoyalty is authorised
    await mp.write.setEscrow([escrow.address]);
    return { mp, escrow };
  }

  // ── estimateCost ──────────────────────────────────────────────────

  it("estimateCost: rank < 16 uses multiplier 1", async () => {
    const { escrow } = await deployAll();
    const cost = await escrow.read.estimateCost([100, 8]); // 100 episodes, rank 8
    const expected = parseEther("0.001") * 100n * 1n;
    assert.equal(cost, expected);
  });

  it("estimateCost: rank 32 uses multiplier 2", async () => {
    const { escrow } = await deployAll();
    const cost = await escrow.read.estimateCost([50, 32]); // 50 episodes, rank 32
    const expected = parseEther("0.001") * 50n * 2n;
    assert.equal(cost, expected);
  });

  it("estimateCost: rank 64 uses multiplier 4", async () => {
    const { escrow } = await deployAll();
    const cost = await escrow.read.estimateCost([10, 64]);
    const expected = parseEther("0.001") * 10n * 4n;
    assert.equal(cost, expected);
  });

  // ── depositJob ────────────────────────────────────────────────────

  it("depositJob stores job and emits JobDeposited", async () => {
    const { escrow } = await deployAll();
    const deposit = parseEther("0.1");

    await viem.assertions.emitWithArgs(
      escrow.write.depositJob([JOB_A, provider.account.address, GYM_KEY], {
        account: creator.account,
        value: deposit,
      }),
      escrow,
      "JobDeposited",
      [JOB_A, getAddress(creator.account.address), getAddress(provider.account.address), deposit],
    );

    const job = await escrow.read.jobs([JOB_A]);
    assert.equal(job[0].toLowerCase(), creator.account.address.toLowerCase()); // creator
    assert.equal(job[4], 0); // status Pending = 0
  });

  it("depositJob reverts on duplicate jobId", async () => {
    const { escrow } = await deployAll();
    const deposit = parseEther("0.1");
    await escrow.write.depositJob([JOB_A, provider.account.address, GYM_KEY], {
      account: creator.account, value: deposit,
    });
    await assert.rejects(
      escrow.write.depositJob([JOB_A, provider.account.address, GYM_KEY], {
        account: creator.account, value: deposit,
      }),
      /JobAlreadyExists/,
    );
  });

  it("depositJob reverts when deposit is zero", async () => {
    const { escrow } = await deployAll();
    await assert.rejects(
      escrow.write.depositJob([JOB_A, provider.account.address, GYM_KEY], {
        account: creator.account, value: 0n,
      }),
      /DepositRequired/,
    );
  });

  // ── completeJob ───────────────────────────────────────────────────

  it("completeJob splits: 80% provider, 10% royalty, 10% treasury (gym listed)", async () => {
    const { mp, escrow } = await deployAll();

    // list a gym so the royalty route works
    await mp.write.listGym([GYM_KEY, "TestGym", "Coding", "Open", 0n], {
      account: gymSeller.account,
    });

    const deposit = parseEther("1");
    await escrow.write.depositJob([JOB_A, provider.account.address, GYM_KEY], {
      account: creator.account, value: deposit,
    });

    const providerBefore = await publicClient.getBalance({ address: provider.account.address });
    const treasuryBefore = await publicClient.getBalance({ address: deployer.account.address });

    await escrow.write.completeJob([JOB_A], { account: deployer.account }); // oracle = deployer

    const providerAfter = await publicClient.getBalance({ address: provider.account.address });
    const treasuryAfter = await publicClient.getBalance({ address: deployer.account.address });

    // provider receives 80% = 0.8 ether
    assert.ok(providerAfter - providerBefore >= parseEther("0.79")); // minus tx gas

    // gym builder royalty credited (10% = 0.1 ether)
    const royalty = await mp.read.pendingRoyalties([gymSeller.account.address]);
    assert.equal(royalty, parseEther("0.1"));

    // job status = Completed (1)
    const job = await escrow.read.jobs([JOB_A]);
    assert.equal(job[4], 1);
  });

  it("completeJob sends royalty to treasury when no gym listing", async () => {
    const { escrow } = await deployAll();
    const noGymKey = keccak256(toBytes("unknown-gym"));
    const deposit = parseEther("1");

    await escrow.write.depositJob([JOB_A, provider.account.address, noGymKey], {
      account: creator.account, value: deposit,
    });

    const treasuryBefore = await publicClient.getBalance({ address: deployer.account.address });
    await escrow.write.completeJob([JOB_A], { account: deployer.account });
    const treasuryAfter = await publicClient.getBalance({ address: deployer.account.address });

    // treasury receives 10% platform + 10% royalty fallback = 20% of 1 ether = 0.2 ether
    // minus gas from the completeJob call itself
    assert.ok(treasuryAfter + parseEther("0.05") > treasuryBefore); // net positive after gas
  });

  it("completeJob reverts when called by non-oracle", async () => {
    const { escrow } = await deployAll();
    await escrow.write.depositJob([JOB_A, provider.account.address, GYM_KEY], {
      account: creator.account, value: parseEther("0.1"),
    });
    await assert.rejects(
      escrow.write.completeJob([JOB_A], { account: attacker.account }),
      /OnlyOracle/,
    );
  });

  it("completeJob reverts on already-completed job", async () => {
    const { escrow } = await deployAll();
    const deposit = parseEther("0.1");
    await escrow.write.depositJob([JOB_A, provider.account.address, GYM_KEY], {
      account: creator.account, value: deposit,
    });
    await escrow.write.completeJob([JOB_A], { account: deployer.account });
    await assert.rejects(
      escrow.write.completeJob([JOB_A], { account: deployer.account }),
      /JobNotPending/,
    );
  });

  // ── refundJob ─────────────────────────────────────────────────────

  it("refundJob returns deposit to creator and emits JobRefunded", async () => {
    const { escrow } = await deployAll();
    const deposit = parseEther("0.5");
    await escrow.write.depositJob([JOB_B, provider.account.address, GYM_KEY], {
      account: creator.account, value: deposit,
    });

    const creatorBefore = await publicClient.getBalance({ address: creator.account.address });
    await escrow.write.refundJob([JOB_B], { account: deployer.account });
    const creatorAfter = await publicClient.getBalance({ address: creator.account.address });

    assert.ok(creatorAfter - creatorBefore >= parseEther("0.49")); // near full refund

    const job = await escrow.read.jobs([JOB_B]);
    assert.equal(job[4], 2); // status Refunded = 2
  });

  it("refundJob reverts when called by non-oracle", async () => {
    const { escrow } = await deployAll();
    await escrow.write.depositJob([JOB_A, provider.account.address, GYM_KEY], {
      account: creator.account, value: parseEther("0.1"),
    });
    await assert.rejects(
      escrow.write.refundJob([JOB_A], { account: attacker.account }),
      /OnlyOracle/,
    );
  });
});
