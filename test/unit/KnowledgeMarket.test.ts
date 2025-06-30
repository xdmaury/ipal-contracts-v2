import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { KnowledgeMarket } from "../../typechain-types";

describe("KnowledgeMarket", function () {
    let knowledgeMarket: KnowledgeMarket;
    let owner: SignerWithAddress;
    let vaultOwner: SignerWithAddress;
    let user: SignerWithAddress;
    let anotherUser: SignerWithAddress;

    const VAULT_ID = "vault123";
    const IMAGE_URL = "https://example.com/image.jpg";
    const PRICE = ethers.parseEther("0.1"); // 0.1 ETH
    const EXPIRATION_DURATION = 86400; // 1 day in seconds
    const COOWNER = ethers.ZeroAddress; // No co-owner for this test
    const COOWNER_SHARE = ethers.toBigInt(0); // No co-owner share for this test 

    beforeEach(async function () {
        [owner, vaultOwner, user, anotherUser] = await ethers.getSigners();

        // Deploy knowledge market contract
        const KnowledgeMarket = await ethers.getContractFactory("KnowledgeMarket");
        knowledgeMarket = await KnowledgeMarket.deploy();
        await knowledgeMarket.waitForDeployment();

        const plataformFee = 1200; // 12% platform fee
        const treasury = owner.address; // Set the treasury address to the owner's address
        await knowledgeMarket.initialize(treasury, plataformFee);


    });

    describe("Subscription Management", function () {
        it("Should allow setting a subscription", async function () {
            await knowledgeMarket.connect(vaultOwner).setSubscription(
                VAULT_ID,
                PRICE,
                EXPIRATION_DURATION,
                IMAGE_URL,
                COOWNER,
                COOWNER_SHARE
            );

            const subscriptions = await knowledgeMarket.getSubscriptions(vaultOwner.address);
            const accessControl = await knowledgeMarket.getAccessControl(vaultOwner.address, VAULT_ID);
            const platformFee = await knowledgeMarket.platformFee();
            const treasury = await knowledgeMarket.treasury();

            expect(subscriptions.length).to.equal(1);
            expect(subscriptions[0].vaultId).to.equal(VAULT_ID);
            expect(subscriptions[0].imageURL).to.equal(IMAGE_URL);

            expect(accessControl.price).to.equal(PRICE);
            expect(accessControl.expirationDuration).to.equal(EXPIRATION_DURATION);
            expect(accessControl.coOwner).to.equal(COOWNER);
            expect(accessControl.splitFee).to.equal(COOWNER_SHARE);

            expect(platformFee).to.equal(1200); // 12% platform fee
            expect(treasury).to.equal(owner.address); // Treasury should be set to owner's address
        });

        it("Should allow changing the co-owner address and fee", async function () {
            const newCoOwnerShare = ethers.toBigInt(6000); // 60% share
            await knowledgeMarket.connect(vaultOwner).setSubscription(
                VAULT_ID,
                PRICE,
                EXPIRATION_DURATION,
                IMAGE_URL,
                anotherUser.address,
                newCoOwnerShare
            );

            const subscriptions = await knowledgeMarket.getSubscriptions(vaultOwner.address);
            expect(subscriptions.length).to.equal(1);
            expect(subscriptions[0].vaultId).to.equal(VAULT_ID);
            expect(subscriptions[0].imageURL).to.equal(IMAGE_URL);

            const accessControl = await knowledgeMarket.getAccessControl(vaultOwner.address, VAULT_ID);
            expect(accessControl.price).to.equal(PRICE);
            expect(accessControl.expirationDuration).to.equal(EXPIRATION_DURATION);
            expect(accessControl.coOwner).to.equal(anotherUser.address);
            expect(accessControl.splitFee).to.equal(newCoOwnerShare);
        });

        it("Should allow deleting a subscription", async function () {
            await knowledgeMarket.connect(vaultOwner).setSubscription(
                VAULT_ID,
                PRICE,
                EXPIRATION_DURATION,
                IMAGE_URL,
                COOWNER,
                COOWNER_SHARE
            );

            await knowledgeMarket.connect(vaultOwner).deleteSubscription(VAULT_ID);

            const subscriptions = await knowledgeMarket.getSubscriptions(vaultOwner.address);
            expect(subscriptions.length).to.equal(0);
        });

        it("Should use default image URL when none provided", async function () {
            await knowledgeMarket.connect(vaultOwner).setSubscription(
                VAULT_ID,
                PRICE,
                EXPIRATION_DURATION,
                "", // Empty image URL
                COOWNER,
                COOWNER_SHARE
            );

            await knowledgeMarket.connect(user).mint(
                vaultOwner.address,
                VAULT_ID,
                user.address,
                { value: PRICE }
            );

            const tokenId = await knowledgeMarket.totalSupply() - 1n;

            const tokenURI = await knowledgeMarket.tokenURI(tokenId);
            expect(tokenURI).to.include("https://arweave.net/"); // Part of the DEFAULT_IMAGE_URL
        });

        it("Should emit SubscriptionCreated event", async function () {
            await expect(knowledgeMarket.connect(vaultOwner).setSubscription(
                VAULT_ID,
                PRICE,
                EXPIRATION_DURATION,
                IMAGE_URL,
                COOWNER,
                COOWNER_SHARE
            ))
                .to.emit(knowledgeMarket, "SubscriptionCreated")
                .withArgs(vaultOwner.address, VAULT_ID, PRICE, EXPIRATION_DURATION);
        });

        it("Should emit SubscriptionDeleted event", async function () {
            // First set a subscription
            await knowledgeMarket.connect(vaultOwner).setSubscription(
                VAULT_ID,
                PRICE,
                EXPIRATION_DURATION,
                IMAGE_URL,
                COOWNER,
                COOWNER_SHARE
            );

            // Then delete it and check for event
            await expect(knowledgeMarket.connect(vaultOwner).deleteSubscription(VAULT_ID))
                .to.emit(knowledgeMarket, "SubscriptionDeleted")
                .withArgs(vaultOwner.address, VAULT_ID);
        });

        it("Should reject empty vaultId", async function () {
            await expect(
                knowledgeMarket.connect(vaultOwner).setSubscription(
                    "", // Empty vaultId
                    PRICE,
                    EXPIRATION_DURATION,
                    IMAGE_URL,
                    COOWNER,
                    COOWNER_SHARE
                )
            ).to.be.revertedWithCustomError(knowledgeMarket, "EmptyVaultId");
        });

        it("Should reject empty vaultId", async function () {
            await expect(
                knowledgeMarket.connect(vaultOwner).setSubscription(
                    "", // Empty vaultId
                    PRICE,
                    EXPIRATION_DURATION,
                    IMAGE_URL,
                    COOWNER,
                    COOWNER_SHARE
                )
            ).to.be.revertedWithCustomError(knowledgeMarket, "EmptyVaultId");
        });

        it("Should allow free NFTs with zero price", async function () {
            // Set subscription with zero price
            await knowledgeMarket.connect(vaultOwner).setSubscription(
                "freeVault",
                0, // Zero price
                EXPIRATION_DURATION,
                IMAGE_URL,
                COOWNER,
                COOWNER_SHARE
            );

            const subscriptions = await knowledgeMarket.getSubscriptions(vaultOwner.address);
            const freeSubscription = subscriptions.find(s => s.vaultId === "freeVault");
            expect(freeSubscription).to.not.be.undefined;

            // Test minting a free NFT
            await knowledgeMarket.connect(user).mint(
                vaultOwner.address,
                "freeVault",
                user.address,
                { value: 0 }
            );

            // Check the user has access
            const hasAccess = await knowledgeMarket.hasAccess(
                vaultOwner.address,
                "freeVault",
                user.address
            );
            expect(hasAccess).to.be.true;
        });

        it("Should reject zero duration", async function () {
            await expect(
                knowledgeMarket.connect(vaultOwner).setSubscription(
                    VAULT_ID,
                    PRICE,
                    0, // Zero duration
                    IMAGE_URL,
                    COOWNER,
                    COOWNER_SHARE
                )
            ).to.be.revertedWithCustomError(knowledgeMarket, "ZeroDuration");
        });

        it("Should reject empty vaultId when deleting", async function () {
            await expect(
                knowledgeMarket.connect(vaultOwner).deleteSubscription("")
            ).to.be.revertedWithCustomError(knowledgeMarket, "EmptyVaultId");
        });

        it("Should not do anything when deleting non-existent subscription", async function () {
            // Delete a subscription that doesn't exist
            await knowledgeMarket.connect(vaultOwner).deleteSubscription("nonexistent");

            // Verify no changes
            const subscriptions = await knowledgeMarket.getSubscriptions(vaultOwner.address);
            expect(subscriptions.length).to.equal(0);
        });
    });

    describe("Minting", function () {
        beforeEach(async function () {
            // Set up a subscription first
            await knowledgeMarket.connect(vaultOwner).setSubscription(
                VAULT_ID,
                PRICE,
                EXPIRATION_DURATION,
                IMAGE_URL,
                COOWNER,
                COOWNER_SHARE
            );
        });

        it("Should allow minting with correct payment", async function () {
            await knowledgeMarket.connect(user).mint(
                vaultOwner.address,
                VAULT_ID,
                user.address,
                { value: PRICE }
            );

            const tokenId = await knowledgeMarket.totalSupply() - 1n;
            const deal = await knowledgeMarket.dealInfo(tokenId);
            expect(deal.vaultOwner).to.equal(vaultOwner.address);
            expect(deal.imageURL).to.equal(IMAGE_URL);
            expect(deal.price).to.equal(PRICE);
        });

        it("Should send 12% platform fee to the platformTreasury", async function () {
            const treasuryAddress = await knowledgeMarket.treasury();
            const initialBalance = await ethers.provider.getBalance(treasuryAddress);

            const PLATFORM_FEE = await knowledgeMarket.platformFee(); // 1200 (12%)

            const tx = await knowledgeMarket.connect(user).mint(
                vaultOwner.address,
                VAULT_ID,
                user.address,
                { value: PRICE }
            );
            await tx.wait();

            const finalBalance = await ethers.provider.getBalance(treasuryAddress);
            const expectedFee = (PRICE * PLATFORM_FEE) / 10000n;
            expect(finalBalance - initialBalance).to.equal(expectedFee);
        });

        it("Should fail if platform receives less than expected fee", async function () {
            const treasuryAddress = await knowledgeMarket.treasury();
            const initialBalance = await ethers.provider.getBalance(treasuryAddress);

            const wrongFee = ((PRICE * 1100n) / 10000n); // 11%

            const tx = await knowledgeMarket.connect(user).mint(
                vaultOwner.address,
                VAULT_ID,
                user.address,
                { value: PRICE }
            );
            await tx.wait();

            const finalBalance = await ethers.provider.getBalance(treasuryAddress);
            const actualFee = finalBalance - initialBalance;

            expect(actualFee).to.not.equal(wrongFee);
        });


        it("Should send correct creator amount to the vaultOwner", async function () {
            const vaultOwnerInitialBalance = (await ethers.provider.getBalance(vaultOwner.address));

            const PLATFORM_FEE = await knowledgeMarket.platformFee(); // 1200 (12%)

            const tx = await knowledgeMarket.connect(user).mint(
                vaultOwner.address,
                VAULT_ID,
                user.address,
                { value: PRICE }
            );
            await tx.wait();

            const vaultOwnerFinalBalance = (await ethers.provider.getBalance(vaultOwner.address));

            const expectedPlatformFee = (PRICE * PLATFORM_FEE) / 10000n;
            const expectedCreatorAmount = PRICE - expectedPlatformFee;

            expect(vaultOwnerFinalBalance - vaultOwnerInitialBalance).to.equal(expectedCreatorAmount);
        });

        it("Should fail if vaultOwner receives an incorrect creator amount", async function () {
            const vaultOwnerInitialBalance = await ethers.provider.getBalance(vaultOwner.address);

            const tx = await knowledgeMarket.connect(user).mint(
                vaultOwner.address,
                VAULT_ID,
                user.address,
                { value: PRICE }
            );
            await tx.wait();

            const vaultOwnerFinalBalance = await ethers.provider.getBalance(vaultOwner.address);

            const wrongPlatformFee = (PRICE * 1100n) / 10000n; // 11%
            const wrongCreatorAmount = PRICE - wrongPlatformFee;

            const receivedAmount = vaultOwnerFinalBalance - vaultOwnerInitialBalance;

            expect(receivedAmount).to.not.equal(wrongCreatorAmount);
        });


        it("Should fail if payment amount is incorrect", async function () {
            const wrongPrice = PRICE - ethers.parseEther("0.01"); // Less than required price
            await expect(
                knowledgeMarket.connect(user).mint(
                    vaultOwner.address,
                    VAULT_ID,
                    user.address,
                    { value: wrongPrice }
                )
            ).to.be.revertedWithCustomError(knowledgeMarket, "InsufficientFunds");
        });

        it("Should emit AccessGranted event", async function () {
            const tx = knowledgeMarket.connect(user).mint(
                vaultOwner.address,
                VAULT_ID,
                user.address,
                { value: PRICE }
            );

            const tokenId = await knowledgeMarket.totalSupply();

            await expect(tx)
                .to.emit(knowledgeMarket, "AccessGranted")
                .withArgs(vaultOwner.address, VAULT_ID, user.address, tokenId, PRICE);
        });

        it("Should fail with zero address for vaultOwner", async function () {
            await expect(
                knowledgeMarket.connect(user).mint(
                    ethers.ZeroAddress,
                    VAULT_ID,
                    user.address,
                    { value: PRICE }
                )
            ).to.be.revertedWithCustomError(knowledgeMarket, "ZeroAddress");
        });

        it("Should fail with zero address for receiver", async function () {
            await expect(
                knowledgeMarket.connect(user).mint(
                    vaultOwner.address,
                    VAULT_ID,
                    ethers.ZeroAddress,
                    { value: PRICE }
                )
            ).to.be.revertedWithCustomError(knowledgeMarket, "ZeroAddress");
        });

        it("Should fail with empty vaultId", async function () {
            await expect(
                knowledgeMarket.connect(user).mint(
                    vaultOwner.address,
                    "",
                    user.address,
                    { value: PRICE }
                )
            ).to.be.revertedWithCustomError(knowledgeMarket, "EmptyVaultId");
        });
    });

    describe("Access Control", function () {
        beforeEach(async function () {
            // Set up a subscription first
            await knowledgeMarket.connect(vaultOwner).setSubscription(
                VAULT_ID,
                PRICE,
                EXPIRATION_DURATION,
                IMAGE_URL,
                COOWNER,
                COOWNER_SHARE
            );
        });

        it("Should grant access after minting", async function () {
            // User mints the access NFT
            await knowledgeMarket.connect(user).mint(
                vaultOwner.address,
                VAULT_ID,
                user.address,
                { value: PRICE }
            );

            // Check if the user has access to any of the vault owner's resources
            const hasGeneralAccess = await knowledgeMarket.hasAccess(vaultOwner.address, VAULT_ID, user.address);
            expect(hasGeneralAccess).to.be.true;
        });

        it("Should not grant access without minting", async function () {
            // Check access without minting
            const hasGeneralAccess = await knowledgeMarket.hasAccess(vaultOwner.address, VAULT_ID, user.address);
            expect(hasGeneralAccess).to.be.false;
        });

        it("Should verify access for specific vault", async function () {
            // User mints the access NFT
            await knowledgeMarket.connect(user).mint(
                vaultOwner.address,
                VAULT_ID,
                user.address,
                { value: PRICE }
            );

            // Check if the user has access to the specific vault
            const hasSpecificAccess = await knowledgeMarket.hasAccess(
                vaultOwner.address,
                VAULT_ID,
                user.address
            );
            expect(hasSpecificAccess).to.be.true;
        });

        it("Should return false for zero addresses", async function () {
            // Check access with zero address for vaultOwner
            const hasGeneralAccess1 = await knowledgeMarket.hasAccess(
                ethers.ZeroAddress,
                VAULT_ID,
                user.address
            );
            expect(hasGeneralAccess1).to.be.false;

            // Check access with zero address for customer
            const hasGeneralAccess2 = await knowledgeMarket.hasAccess(
                vaultOwner.address,
                VAULT_ID,
                ethers.ZeroAddress
            );
            expect(hasGeneralAccess2).to.be.false;
        });
    });
});