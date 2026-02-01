// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@limitbreak/creator-token-standards/src/erc721c/ERC721C.sol";
import "@limitbreak/creator-token-standards/src/programmable-royalties/BasicRoyalties.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title EmberTowerItems
 * @notice ERC-721C NFTs for Ember Tower furniture and items
 * @dev 100 royalties to stakers on secondary sales
 */
contract EmberTowerItems is ERC721C, BasicRoyalties, Ownable {
    using Strings for uint256;

    // Item rarity
    enum Rarity { Common, Uncommon, Rare, Epic, Legendary, Mythic }

    // Item metadata
    struct Item {
        uint16 itemType;    // Item type ID (1-100+)
        Rarity rarity;
        uint8 width;        // Size in tiles
        uint8 height;
        bool sittable;      // Can users sit on this?
    }

    // Constants
    uint96 public constant ROYALTY_BPS = 1000; // 10% royalty
    
    // State
    IERC20 public immutable emberToken;
    address public immutable stakingWallet;
    mapping(uint256 => Item) public items;
    mapping(uint16 => uint256) public itemPrices; // itemType => price
    mapping(uint16 => Rarity) public itemRarities;
    mapping(uint16 => uint8) public itemWidths;
    mapping(uint16 => uint8) public itemHeights;
    mapping(uint16 => bool) public itemSittable;
    uint256 public totalMinted;
    string public baseURI;

    // Events
    event ItemMinted(uint256 indexed tokenId, address indexed owner, uint16 itemType, Rarity rarity);
    event ItemPriceSet(uint16 indexed itemType, uint256 price, Rarity rarity);

    // Errors
    error ItemTypeNotFound();
    error InsufficientPayment();

    constructor(
        address _emberToken,
        address _stakingWallet,
        address _royaltyReceiver
    )
        ERC721OpenZeppelin("Ember Tower Items", "ETITEM")
        BasicRoyalties(_royaltyReceiver, ROYALTY_BPS)
        Ownable(msg.sender)
    {
        emberToken = IERC20(_emberToken);
        stakingWallet = _stakingWallet;
        
        _initializeItems();
    }

    /**
     * @dev Initialize 100 furniture items
     */
    function _initializeItems() internal {
        // Seating (1-15)
        _setItem(1, 10_000 * 1e18, Rarity.Common, 1, 1, true);      // Basic Chair
        _setItem(2, 15_000 * 1e18, Rarity.Common, 1, 1, true);      // Wooden Chair
        _setItem(3, 20_000 * 1e18, Rarity.Common, 1, 1, true);      // Office Chair
        _setItem(4, 25_000 * 1e18, Rarity.Common, 1, 1, true);      // Bar Stool
        _setItem(5, 100_000 * 1e18, Rarity.Uncommon, 2, 2, true);   // Bean Bag
        _setItem(6, 200_000 * 1e18, Rarity.Uncommon, 3, 1, true);   // Couch
        _setItem(7, 150_000 * 1e18, Rarity.Uncommon, 2, 1, true);   // Loveseat
        _setItem(8, 250_000 * 1e18, Rarity.Uncommon, 2, 2, true);   // Recliner
        _setItem(9, 1_000_000 * 1e18, Rarity.Rare, 1, 1, true);     // Gaming Chair
        _setItem(10, 2_000_000 * 1e18, Rarity.Rare, 2, 2, true);    // Egg Chair
        _setItem(11, 1_500_000 * 1e18, Rarity.Rare, 2, 1, true);    // Swing
        _setItem(12, 1_000_000 * 1e18, Rarity.Rare, 3, 1, true);    // Hammock
        _setItem(13, 10_000_000 * 1e18, Rarity.Epic, 2, 2, true);   // Throne
        _setItem(14, 25_000_000 * 1e18, Rarity.Epic, 4, 2, true);   // Dragon Couch
        _setItem(15, 100_000_000 * 1e18, Rarity.Legendary, 3, 3, true); // Mythic Throne

        // Tables (16-25)
        _setItem(16, 15_000 * 1e18, Rarity.Common, 2, 1, false);    // Coffee Table
        _setItem(17, 30_000 * 1e18, Rarity.Common, 3, 2, false);    // Dining Table
        _setItem(18, 25_000 * 1e18, Rarity.Common, 2, 1, false);    // Desk
        _setItem(19, 10_000 * 1e18, Rarity.Common, 1, 1, false);    // Nightstand
        _setItem(20, 12_000 * 1e18, Rarity.Common, 1, 1, false);    // End Table
        _setItem(21, 150_000 * 1e18, Rarity.Uncommon, 3, 1, false); // Counter
        _setItem(22, 2_000_000 * 1e18, Rarity.Rare, 3, 3, true);    // Poker Table
        _setItem(23, 3_000_000 * 1e18, Rarity.Rare, 4, 2, false);   // Pool Table
        _setItem(24, 2_500_000 * 1e18, Rarity.Rare, 4, 2, false);   // Ping Pong
        _setItem(25, 15_000_000 * 1e18, Rarity.Epic, 3, 2, false);  // Dragon Stone Table

        // Beds (26-33)
        _setItem(26, 20_000 * 1e18, Rarity.Common, 2, 3, true);     // Single Bed
        _setItem(27, 40_000 * 1e18, Rarity.Common, 3, 3, true);     // Double Bed
        _setItem(28, 200_000 * 1e18, Rarity.Uncommon, 2, 3, true);  // Bunk Bed
        _setItem(29, 150_000 * 1e18, Rarity.Uncommon, 3, 2, true);  // Futon
        _setItem(30, 2_000_000 * 1e18, Rarity.Rare, 4, 4, true);    // Canopy Bed
        _setItem(31, 15_000 * 1e18, Rarity.Common, 1, 2, true);     // Sleeping Bag
        _setItem(32, 20_000_000 * 1e18, Rarity.Epic, 4, 4, true);   // Dragon Nest
        _setItem(33, 150_000_000 * 1e18, Rarity.Legendary, 4, 4, true); // Lava Bed

        // Decor items (34-50)
        _setItem(34, 25_000 * 1e18, Rarity.Common, 2, 1, false);    // Bookshelf
        _setItem(35, 20_000 * 1e18, Rarity.Common, 1, 1, false);    // Cabinet
        _setItem(36, 30_000 * 1e18, Rarity.Common, 2, 1, false);    // Dresser
        _setItem(37, 100_000 * 1e18, Rarity.Uncommon, 2, 1, false); // Wardrobe
        _setItem(38, 150_000 * 1e18, Rarity.Uncommon, 2, 1, false); // Chest
        _setItem(39, 1_000_000 * 1e18, Rarity.Rare, 1, 1, false);   // Safe
        _setItem(40, 1_500_000 * 1e18, Rarity.Rare, 2, 1, false);   // Display Case
        _setItem(41, 2_000_000 * 1e18, Rarity.Rare, 3, 1, false);   // Trophy Shelf
        _setItem(42, 200_000 * 1e18, Rarity.Uncommon, 2, 1, false); // TV
        _setItem(43, 250_000 * 1e18, Rarity.Uncommon, 2, 1, false); // Computer
        _setItem(44, 1_000_000 * 1e18, Rarity.Rare, 1, 1, true);    // Arcade Machine
        _setItem(45, 1_500_000 * 1e18, Rarity.Rare, 1, 1, false);   // Jukebox
        _setItem(46, 2_000_000 * 1e18, Rarity.Rare, 2, 1, false);   // DJ Turntable
        _setItem(47, 100_000 * 1e18, Rarity.Uncommon, 1, 1, false); // Speaker
        _setItem(48, 3_000_000 * 1e18, Rarity.Rare, 1, 2, false);   // Vending Machine
        _setItem(49, 5_000_000 * 1e18, Rarity.Rare, 1, 1, false);   // ATM
        _setItem(50, 20_000_000 * 1e18, Rarity.Epic, 2, 2, false);  // Hologram

        // Nature tiles (51-62)
        _setItem(51, 5_000 * 1e18, Rarity.Common, 1, 1, false);     // Grass Tile
        _setItem(52, 8_000 * 1e18, Rarity.Common, 1, 1, false);     // Water Tile
        _setItem(53, 5_000_000 * 1e18, Rarity.Epic, 1, 1, false);   // Lava Tile
        _setItem(54, 5_000 * 1e18, Rarity.Common, 1, 1, false);     // Rock Tile
        _setItem(55, 5_000 * 1e18, Rarity.Common, 1, 1, false);     // Sand Tile
        _setItem(56, 50_000 * 1e18, Rarity.Uncommon, 1, 1, false);  // Snow Tile
        _setItem(57, 25_000_000 * 1e18, Rarity.Epic, 2, 3, false);  // Waterfall
        _setItem(58, 3_000_000 * 1e18, Rarity.Rare, 3, 3, false);   // Pond
        _setItem(59, 2_000_000 * 1e18, Rarity.Rare, 2, 2, false);   // Fire Pit
        _setItem(60, 200_000 * 1e18, Rarity.Uncommon, 2, 2, false); // Tree
        _setItem(61, 15_000 * 1e18, Rarity.Common, 1, 1, false);    // Bush
        _setItem(62, 10_000 * 1e18, Rarity.Common, 1, 1, false);    // Flower Pot

        // Lighting (63-70)
        _setItem(63, 15_000 * 1e18, Rarity.Common, 1, 1, false);    // Floor Lamp
        _setItem(64, 10_000 * 1e18, Rarity.Common, 1, 1, false);    // Table Lamp
        _setItem(65, 1_000_000 * 1e18, Rarity.Rare, 2, 2, false);   // Chandelier
        _setItem(66, 300_000 * 1e18, Rarity.Uncommon, 2, 1, false); // Neon Sign
        _setItem(67, 8_000 * 1e18, Rarity.Common, 1, 1, false);     // Candles
        _setItem(68, 3_000_000 * 1e18, Rarity.Rare, 2, 1, false);   // Fireplace
        _setItem(69, 150_000 * 1e18, Rarity.Uncommon, 1, 1, false); // Lava Lamp
        _setItem(70, 2_000_000 * 1e18, Rarity.Rare, 1, 1, false);   // Disco Ball

        // More decor (71-85)
        _setItem(71, 10_000 * 1e18, Rarity.Common, 1, 1, false);    // Plant
        _setItem(72, 20_000 * 1e18, Rarity.Common, 1, 1, false);    // Painting
        _setItem(73, 25_000 * 1e18, Rarity.Common, 1, 1, false);    // Mirror
        _setItem(74, 15_000 * 1e18, Rarity.Common, 2, 2, false);    // Small Rug
        _setItem(75, 100_000 * 1e18, Rarity.Uncommon, 4, 4, false); // Large Rug
        _setItem(76, 20_000 * 1e18, Rarity.Common, 1, 1, false);    // Curtains
        _setItem(77, 15_000 * 1e18, Rarity.Common, 1, 1, false);    // Clock
        _setItem(78, 1_000_000 * 1e18, Rarity.Rare, 1, 1, false);   // Statue
        _setItem(79, 2_000_000 * 1e18, Rarity.Rare, 2, 2, false);   // Fountain
        _setItem(80, 1_500_000 * 1e18, Rarity.Rare, 2, 1, false);   // Aquarium
        _setItem(81, 200_000 * 1e18, Rarity.Uncommon, 1, 1, false); // Trophy
        _setItem(82, 10_000 * 1e18, Rarity.Common, 1, 1, false);    // Flag
        _setItem(83, 5_000 * 1e18, Rarity.Common, 1, 1, false);     // Poster
        _setItem(84, 15_000_000 * 1e18, Rarity.Epic, 2, 2, false);  // Dragon Statue
        _setItem(85, 10_000_000 * 1e18, Rarity.Epic, 1, 1, false);  // Crystal Ball

        // Kitchen & Bathroom (86-100)
        _setItem(86, 150_000 * 1e18, Rarity.Uncommon, 1, 1, false); // Fridge
        _setItem(87, 200_000 * 1e18, Rarity.Uncommon, 1, 1, false); // Stove
        _setItem(88, 50_000 * 1e18, Rarity.Common, 1, 1, false);    // Kitchen Sink
        _setItem(89, 100_000 * 1e18, Rarity.Uncommon, 2, 1, false); // Kitchen Counter
        _setItem(90, 1_000_000 * 1e18, Rarity.Rare, 3, 1, true);    // Bar
        _setItem(91, 1_500_000 * 1e18, Rarity.Rare, 2, 1, false);   // Grill
        _setItem(92, 10_000_000 * 1e18, Rarity.Epic, 2, 2, false);  // Dragon Fridge
        _setItem(93, 2_000_000 * 1e18, Rarity.Rare, 2, 2, false);   // Cauldron
        _setItem(94, 30_000 * 1e18, Rarity.Common, 1, 1, true);     // Toilet
        _setItem(95, 25_000 * 1e18, Rarity.Common, 1, 1, false);    // Bathroom Sink
        _setItem(96, 200_000 * 1e18, Rarity.Uncommon, 2, 1, true);  // Bathtub
        _setItem(97, 150_000 * 1e18, Rarity.Uncommon, 1, 1, false); // Shower
        _setItem(98, 3_000_000 * 1e18, Rarity.Rare, 3, 3, true);    // Hot Tub
        _setItem(99, 5_000_000 * 1e18, Rarity.Rare, 3, 3, true);    // Sauna
        _setItem(100, 1_000_000_000 * 1e18, Rarity.Mythic, 2, 2, false); // Dragon Egg (special)
    }

    function _setItem(
        uint16 itemType,
        uint256 price,
        Rarity rarity,
        uint8 width,
        uint8 height,
        bool sittable
    ) internal {
        itemPrices[itemType] = price;
        itemRarities[itemType] = rarity;
        itemWidths[itemType] = width;
        itemHeights[itemType] = height;
        itemSittable[itemType] = sittable;
        
        emit ItemPriceSet(itemType, price, rarity);
    }

    /**
     * @notice Mint an item NFT
     */
    function mintItem(uint16 itemType) external returns (uint256) {
        uint256 price = itemPrices[itemType];
        if (price == 0) revert ItemTypeNotFound();

        // 50% burn, 50% stake
        uint256 burnAmount = price / 2;
        uint256 stakeAmount = price - burnAmount;
        
        emberToken.transferFrom(msg.sender, address(0xdead), burnAmount);
        emberToken.transferFrom(msg.sender, stakingWallet, stakeAmount);

        // Mint
        totalMinted++;
        uint256 tokenId = totalMinted;
        
        items[tokenId] = Item({
            itemType: itemType,
            rarity: itemRarities[itemType],
            width: itemWidths[itemType],
            height: itemHeights[itemType],
            sittable: itemSittable[itemType]
        });
        
        _mint(msg.sender, tokenId);
        
        emit ItemMinted(tokenId, msg.sender, itemType, itemRarities[itemType]);
        
        return tokenId;
    }

    /**
     * @notice Set item price (owner only)
     */
    function setItemPrice(uint16 itemType, uint256 price, Rarity rarity) external onlyOwner {
        itemPrices[itemType] = price;
        itemRarities[itemType] = rarity;
        emit ItemPriceSet(itemType, price, rarity);
    }

    function setBaseURI(string calldata _baseURI) external onlyOwner {
        baseURI = _baseURI;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string(abi.encodePacked(baseURI, tokenId.toString(), ".json"));
    }

    // Required overrides
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721C, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _requireCallerIsContractOwner() internal view virtual override {
        _checkOwner();
    }
}

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}
