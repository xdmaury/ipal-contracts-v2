// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

/// @notice Base contract with logic and storage for subscription access
abstract contract KnowledgeAccessBase {
    struct Settings {
        uint256 price;
        uint32 expirationDuration;
        address coOwner;
        uint32 splitFee; // in basis points (ex: 2500 = 25%)
    }

    struct Metadata {
        bytes32 hash;
        string resourceId;
        uint32 expirationTime;
    }

    struct Subscription {
        string vaultId;
        string imageURL;
    }

    mapping(bytes32 => Settings) public accessControl;
    mapping(uint256 => Metadata) public nftData;
    mapping(address => Subscription[]) public subscriptions;

    error ZeroAddress();
    error EmptyVaultId();
    error ZeroDuration();
    error InvalidFee();
    error SameOwnerAndCoOwner();

    event SubscriptionCreated(address indexed vaultOwner, string vaultId, uint256 price, uint32 expirationDuration);
    event SubscriptionDeleted(address indexed owner, string vaultId);

    function _vaultHash(
        address owner,
        string memory vaultId
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(owner, vaultId));
    }

    function setSubscription(
        string calldata vaultId,
        uint256 price,
        uint32 duration,
        string calldata imageURL,
        address coOwner,
        uint32 splitFee
    ) external {
        if (bytes(vaultId).length == 0) revert EmptyVaultId();
        if (duration == 0) revert ZeroDuration();
        if (coOwner == msg.sender) revert SameOwnerAndCoOwner();
        if (splitFee > 10000) revert InvalidFee();

        bytes32 hash = _vaultHash(msg.sender, vaultId);
        accessControl[hash] = Settings(price, duration, coOwner, splitFee);

        Subscription[] storage subs = subscriptions[msg.sender];
        bool updated = false;
        bytes32 vaultKey = keccak256(bytes(vaultId));

        for (uint i = 0; i < subs.length; i++) {
            if (keccak256(bytes(subs[i].vaultId)) == vaultKey) {
                subs[i].imageURL = bytes(imageURL).length > 0 ? imageURL : defaultImage();
                updated = true;
                break;
            }
        }

        if (!updated) {
            subs.push(Subscription(
                vaultId,
                bytes(imageURL).length > 0 ? imageURL : defaultImage()
            ));
        }

        emit SubscriptionCreated(msg.sender, vaultId, price, duration);
    }

    function deleteSubscription(string calldata vaultId) external {
        if (bytes(vaultId).length == 0) revert EmptyVaultId();

        bytes32 hash = _vaultHash(msg.sender, vaultId);
        delete accessControl[hash];

        Subscription[] storage subs = subscriptions[msg.sender];
        for (uint i = 0; i < subs.length; i++) {
            if (
                keccak256(bytes(subs[i].vaultId)) == keccak256(bytes(vaultId))
            ) {
                subs[i] = subs[subs.length - 1];
                subs.pop();
                emit SubscriptionDeleted(msg.sender, vaultId);
                break;
            }
        }
    }

    function hasAccess(
        address vaultOwner,
        string calldata vaultId,
        address user
    ) external view returns (bool) {
        if (vaultOwner == address(0) || user == address(0)) return false;

        bytes32 hash = _vaultHash(vaultOwner, vaultId);
        for (uint i = 0; i < ERC721Enumerable(address(this)).balanceOf(user); i++ ) {
            uint256 tokenId = ERC721Enumerable(address(this)).tokenOfOwnerByIndex(user, i);
            if (
                nftData[tokenId].hash == hash &&
                block.timestamp <= nftData[tokenId].expirationTime
            ) {
                return true;
            }
        }
        return false;
    }

    function getAccessControl(
        address author,
        string calldata vaultId
    )
        external
        view
        returns (
            uint256 price,
            uint32 expirationDuration,
            address coOwner,
            uint32 splitFee
        )
    {
        bytes32 hash = _vaultHash(author, vaultId);
        return (
            accessControl[hash].price,
            accessControl[hash].expirationDuration,
            accessControl[hash].coOwner,
            accessControl[hash].splitFee
        );
    }

    function getSubscriptions(
        address owner
    ) external view returns (Subscription[] memory) {
        return subscriptions[owner];
    }

    function defaultImage() public view virtual returns (string memory);
}
