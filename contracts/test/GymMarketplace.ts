import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { parseEther, keccak256, toBytes, getAddress } from "viem";

// Deterministic rootHash key for tests
const ROOT_A = keccak256(toBytes("0xdeadbeef0000000000000000000000000000000000000000000000000000cafe"));
const ROOT_B = keccak256(toBytes("0xabcd1234000000000000000000000000000000000000000000000000000056ef"));

describe("GymMarketplace", async () => {
  const { viem } = await network.create();
  const publicClient = await viem.getPublicClient();
  const [deployer, seller, buyer, attacker] = await viem.getWalletClients();

  async function deploy() {
    return viem.deployContract("GymMarketplace", [deployer.account.address]);
  }

  // ── listGym ────────────────────────────────────────────────────────

  it("lists a gym and emits GymListed", async () => {
    const mp = await deploy();
    await viem.assertions.emitWithArgs(
      mp.write.listGym([ROOT_A, "CodingGym", "Coding", "Open", 0n], {
        account: seller.account,
      }),
      mp,
      "GymListed",
      [ROOT_A, getAddress(seller.account.address), 0n, "CodingGym"],
    );

    const listing = await mp.read.getListing([ROOT_A]);
    assert.equal(listing.seller.toLowerCase(), seller.account.address.toLowerCase());
    assert.equal(listing.name, "CodingGym");
    assert.equal(listing.active, true);
  });

  it("reverts when listing the same rootHash twice", async () => {
    const mp = await deploy();
    await mp.write.listGym([ROOT_A, "Gym", "Coding", "Open", 0n], { account: seller.account });
    await assert.rejects(
      mp.write.listGym([ROOT_A, "Gym2", "Coding", "Open", 0n], { account: seller.account }),
      /AlreadyListed/,
    );
  });

  // ── purchaseGym — free ────────────────────────────────────────────

  it("grants access to a free gym without payment", async () => {
    const mp = await deploy();
    await mp.write.listGym([ROOT_A, "FreeGym", "Math", "Open", 0n], { account: seller.account });
    await mp.write.purchaseGym([ROOT_A], { account: buyer.account, value: 0n });

    const hasAccess = await mp.read.checkAccess([buyer.account.address, ROOT_A]);
    assert.ok(hasAccess);
  });

  it("seller always has access to their own listing", async () => {
    const mp = await deploy();
    await mp.write.listGym([ROOT_A, "MyGym", "Coding", "Pro", parseEther("1")], { account: seller.account });
    const hasAccess = await mp.read.checkAccess([seller.account.address, ROOT_A]);
    assert.ok(hasAccess);
  });

  it("reverts when purchasing an already-owned gym", async () => {
    const mp = await deploy();
    await mp.write.listGym([ROOT_A, "FreeGym", "Math", "Open", 0n], { account: seller.account });
    await mp.write.purchaseGym([ROOT_A], { account: buyer.account, value: 0n });
    await assert.rejects(
      mp.write.purchaseGym([ROOT_A], { account: buyer.account, value: 0n }),
      /AlreadyOwned/,
    );
  });

  // ── purchaseGym — paid ────────────────────────────────────────────

  it("paid purchase transfers 95% to seller and 5% to treasury", async () => {
    const mp = await deploy();
    const price = parseEther("1");
    await mp.write.listGym([ROOT_A, "ProGym", "Physics", "Pro", price], { account: seller.account });

    const sellerBefore = await publicClient.getBalance({ address: seller.account.address });
    const treasuryBefore = await publicClient.getBalance({ address: deployer.account.address });

    await mp.write.purchaseGym([ROOT_A], { account: buyer.account, value: price });

    const sellerAfter = await publicClient.getBalance({ address: seller.account.address });
    const treasuryAfter = await publicClient.getBalance({ address: deployer.account.address });

    // seller gets 95 % = 0.95 ether
    assert.ok(sellerAfter - sellerBefore >= parseEther("0.94")); // allow 1% gas headroom
    // treasury gets 5 % = 0.05 ether
    assert.ok(treasuryAfter - treasuryBefore >= parseEther("0.04"));

    // buyer now has access
    assert.ok(await mp.read.checkAccess([buyer.account.address, ROOT_A]));
  });

  it("reverts when payment is insufficient", async () => {
    const mp = await deploy();
    const price = parseEther("1");
    await mp.write.listGym([ROOT_A, "ProGym", "Physics", "Pro", price], { account: seller.account });
    await assert.rejects(
      mp.write.purchaseGym([ROOT_A], { account: buyer.account, value: parseEther("0.5") }),
      /InsufficientPayment/,
    );
  });

  // ── getListings ───────────────────────────────────────────────────

  it("returns listings newest-first with pagination", async () => {
    const mp = await deploy();
    await mp.write.listGym([ROOT_A, "GymA", "Coding", "Open", 0n], { account: seller.account });
    await mp.write.listGym([ROOT_B, "GymB", "Math", "Open", 0n], { account: seller.account });

    const count = await mp.read.getListingCount();
    assert.equal(count, 2n);

    const [listings, keys] = await mp.read.getListings([0n, 10n]);
    assert.equal(listings.length, 2);
    // newest first — ROOT_B was listed second
    assert.equal(keys[0].toLowerCase(), ROOT_B.toLowerCase());
    assert.equal(keys[1].toLowerCase(), ROOT_A.toLowerCase());
  });

  // ── royalties ─────────────────────────────────────────────────────

  it("creditRoyalty accumulates and claimRoyalties pays out", async () => {
    const mp = await deploy();
    // set escrow to deployer for testing
    await mp.write.setEscrow([deployer.account.address]);

    const royaltyAmount = parseEther("0.1");
    await mp.write.creditRoyalty([seller.account.address, royaltyAmount], {
      account: deployer.account,
      value: royaltyAmount,
    });

    const pending = await mp.read.pendingRoyalties([seller.account.address]);
    assert.equal(pending, royaltyAmount);

    const balBefore = await publicClient.getBalance({ address: seller.account.address });
    await mp.write.claimRoyalties({ account: seller.account });
    const balAfter = await publicClient.getBalance({ address: seller.account.address });

    assert.ok(balAfter > balBefore);
    assert.equal(await mp.read.pendingRoyalties([seller.account.address]), 0n);
  });

  it("reverts claimRoyalties when balance is zero", async () => {
    const mp = await deploy();
    await assert.rejects(
      mp.write.claimRoyalties({ account: seller.account }),
      /NothingToClaim/,
    );
  });

  it("reverts creditRoyalty when called by non-escrow", async () => {
    const mp = await deploy();
    await assert.rejects(
      mp.write.creditRoyalty([seller.account.address, parseEther("0.1")], {
        account: attacker.account,
        value: parseEther("0.1"),
      }),
      /OnlyEscrow/,
    );
  });

  // ── admin ─────────────────────────────────────────────────────────

  it("setPlatformFee reverts when fee exceeds 10%", async () => {
    const mp = await deploy();
    await assert.rejects(mp.write.setPlatformFee([1001n]), /FeeTooHigh/);
  });
});
