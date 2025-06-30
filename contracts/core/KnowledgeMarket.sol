// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import {KnowledgeAccessBase} from "./KnowledgeAccessBase.sol";

contract KnowledgeMarket is Initializable, ERC721Enumerable, ReentrancyGuard, KnowledgeAccessBase {

    struct Deal {
        address vaultOwner;
        string imageURL;
        uint256 price;
    }

    string private constant DEFAULT_IMAGE = "https://arweave.net/9u0cgTmkSM25PfQpGZ-JzspjOMf4uGFjkvOfKjgQnVY";
    address private _initializingAdmin;
    address payable public treasury;
    uint32 public platformFee; // in basis points

    mapping(uint256 => Deal) public dealInfo;

    event AccessGranted(address indexed vaultOwner, string vaultId, address indexed customer, uint256 tokenId, uint256 price);

    error AlreadyInitialized();
    error MintUnavailable();
    error ExpirationOverflow();
    error InsufficientFunds(uint256 required);
    error TreasuryTransferFailed();
    error CoOwnerTransferFailed();
    error VaultOwnerTransferFailed();

    constructor() ERC721("Knowledge Access", "KNW") {}

    function initialize(address payable _treasury, uint32 _fee) public initializer {
        if (_treasury == address(0)) revert ZeroAddress();
        if (_fee > 10000) revert InvalidFee();

        treasury = _treasury;
        platformFee = _fee;
    }

    function mint(address payable vaultOwner, string calldata vaultId, address to) external payable nonReentrant {
        if (vaultOwner == address(0) || to == address(0)) revert ZeroAddress();
        if (bytes(vaultId).length == 0) revert EmptyVaultId();

        bytes32 hash = _vaultHash(vaultOwner, vaultId);
        Settings memory set = accessControl[hash];

        if (set.expirationDuration == 0) revert MintUnavailable();
        if (msg.value < set.price) revert InsufficientFunds(set.price);

        uint256 expiration = block.timestamp + set.expirationDuration;
        if (expiration > type(uint32).max) revert ExpirationOverflow();

        uint256 tokenId = totalSupply();
        nftData[tokenId] = Metadata(hash, vaultId, uint32(expiration));

        string memory image = DEFAULT_IMAGE;
        Subscription[] storage subs = subscriptions[vaultOwner];
        for (uint i = 0; i < subs.length; i++) {
            if (keccak256(bytes(subs[i].vaultId)) == keccak256(bytes(vaultId))) {
                image = subs[i].imageURL;
                break;
            }
        }
        dealInfo[tokenId] = Deal(vaultOwner, image, set.price);

        // Process payment
        _processPayment(vaultOwner, set, set.price);

        // Refund excess payment if any
        if (msg.value > set.price) {
            payable(msg.sender).transfer(msg.value - set.price);
        }

        // Mint the NFT
        _safeMint(to, tokenId);

        emit AccessGranted(vaultOwner, vaultId, to, tokenId, set.price);
    }

    function _processPayment(
        address payable vaultOwner,
        Settings memory set,
        uint256 amount
    ) private {
        uint256 remainig = amount;

        uint256 feeAmount = (set.price * platformFee) / 10000;
        if (feeAmount > 0) {
            (bool feeSuccess, ) = treasury.call{value: feeAmount}("");
            if (!feeSuccess) revert TreasuryTransferFailed();
            remainig -= feeAmount;
        }
        if (set.coOwner != address(0) && set.splitFee > 0) {
            uint256 coPart = (remainig * set.splitFee) / 10000;
            remainig -= coPart;

            (bool coSuccess, ) = set.coOwner.call{value: coPart}("");
            if (!coSuccess) revert CoOwnerTransferFailed();
        }
        if (remainig > 0) {
            (bool ownerSuccess, ) = vaultOwner.call{value: remainig}("");
            if (!ownerSuccess) revert VaultOwnerTransferFailed();
        }
    }

    // This function isn't used in the DApp.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "KnowledgeMarket: URI query for nonexistent token");

        Metadata memory data = nftData[tokenId];
        string memory image = bytes(dealInfo[tokenId].imageURL).length > 0 ? dealInfo[tokenId].imageURL : DEFAULT_IMAGE;

        return string.concat(
            "data:application/json;utf8:",
            string.concat(
                '{"name":"Access to ',
                data.resourceId,
                '","description":"This NFT grants access to a knowledge vault.","image":"',
                image,
                '","attributes":[{"display_type":"date","trait_type":"Expiration","value":',
                Strings.toString(data.expirationTime),
                "}]}"
            )
        );
    }

    function defaultImage() public pure override returns (string memory) {
        return DEFAULT_IMAGE;
    }
}
