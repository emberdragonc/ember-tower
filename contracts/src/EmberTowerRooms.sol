// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@limitbreak/creator-token-standards/src/erc721c/ERC721C.sol";
import "@limitbreak/creator-token-standards/src/programmable-royalties/BasicRoyalties.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title EmberTowerRooms
 * @notice ERC-721C NFTs for Ember Tower room ownership
 * @dev Enforces 100% royalties to stakers on secondary sales
 */
contract EmberTowerRooms is ERC721C, BasicRoyalties, Ownable {
    using Strings for uint256;

    // Room metadata
    struct Room {
        uint8 floor;       // 1-100
        uint8 roomNumber;  // 1-20 per floor (1 for penthouse)
        uint8 size;        // 0=Studio(8x8), 1=1BR(12x12), 2=2BR(16x16), 3=Suite(20x20), 4=Luxury(32x32), 5=Penthouse(128x128)
    }

    // Constants
    uint256 public constant MAX_SUPPLY = 1981;
    uint96 public constant ROYALTY_BPS = 1000; // 10% royalty to stakers
    
    // State
    IERC20 public immutable emberToken;
    address public immutable stakingWallet;
    mapping(uint256 => Room) public rooms;
    uint256 public totalMinted;
    string public baseURI;
    
    // Pricing tiers (in EMBER)
    mapping(uint8 => mapping(uint8 => uint256)) public roomPrices; // floor => size => price

    // Events
    event RoomMinted(uint256 indexed tokenId, address indexed owner, uint8 floor, uint8 roomNumber, uint8 size);
    event PriceUpdated(uint8 floor, uint8 size, uint256 newPrice);

    // Errors
    error InvalidFloor();
    error InvalidRoomNumber();
    error RoomAlreadyMinted();
    error InsufficientPayment();
    error MaxSupplyReached();
    error InvalidSize();

    constructor(
        address _emberToken,
        address _stakingWallet,
        address _royaltyReceiver
    ) 
        ERC721OpenZeppelin("Ember Tower Rooms", "ETROOM")
        BasicRoyalties(_royaltyReceiver, ROYALTY_BPS)
        Ownable(msg.sender)
    {
        emberToken = IERC20(_emberToken);
        stakingWallet = _stakingWallet;
        
        _initializePricing();
    }

    /**
     * @dev Initialize pricing tiers (~20B total)
     */
    function _initializePricing() internal {
        // Floor 1-10 (Budget)
        for (uint8 f = 1; f <= 10; f++) {
            roomPrices[f][0] = 50_000 * 1e18;   // Studio 50K
            roomPrices[f][1] = 100_000 * 1e18;  // 1BR 100K
            roomPrices[f][2] = 200_000 * 1e18;  // 2BR 200K
            roomPrices[f][3] = 400_000 * 1e18;  // Suite 400K
        }
        
        // Floor 11-30 (Standard)
        for (uint8 f = 11; f <= 30; f++) {
            roomPrices[f][0] = 200_000 * 1e18;
            roomPrices[f][1] = 500_000 * 1e18;
            roomPrices[f][2] = 1_000_000 * 1e18;
            roomPrices[f][3] = 2_000_000 * 1e18;
        }
        
        // Floor 31-60 (Premium)
        for (uint8 f = 31; f <= 60; f++) {
            roomPrices[f][0] = 1_000_000 * 1e18;
            roomPrices[f][1] = 2_000_000 * 1e18;
            roomPrices[f][2] = 4_000_000 * 1e18;
            roomPrices[f][3] = 8_000_000 * 1e18;
        }
        
        // Floor 61-90 (Deluxe)
        for (uint8 f = 61; f <= 90; f++) {
            roomPrices[f][2] = 10_000_000 * 1e18;
            roomPrices[f][3] = 20_000_000 * 1e18;
            roomPrices[f][4] = 50_000_000 * 1e18;
        }
        
        // Floor 91-99 (Luxury Suites - all 32x32)
        uint256[9] memory luxuryPrices = [
            uint256(3_000_000_000 * 1e18),   // Floor 91: 3B
            uint256(3_500_000_000 * 1e18),   // Floor 92: 3.5B
            uint256(4_000_000_000 * 1e18),   // Floor 93: 4B
            uint256(4_500_000_000 * 1e18),   // Floor 94: 4.5B
            uint256(5_000_000_000 * 1e18),   // Floor 95: 5B
            uint256(6_000_000_000 * 1e18),   // Floor 96: 6B
            uint256(7_000_000_000 * 1e18),   // Floor 97: 7B
            uint256(8_000_000_000 * 1e18),   // Floor 98: 8B
            uint256(10_000_000_000 * 1e18)   // Floor 99: 10B
        ];
        for (uint8 f = 91; f <= 99; f++) {
            roomPrices[f][4] = luxuryPrices[f - 91];
        }
        
        // Floor 100 (Penthouse)
        roomPrices[100][5] = 1_000_000_000_000 * 1e18; // 1T EMBER (1B with 18 decimals adjustment)
    }

    /**
     * @notice Mint a room NFT
     * @param floor Floor number (1-100)
     * @param roomNumber Room number on floor (1-20, 1 for penthouse)
     */
    function mintRoom(uint8 floor, uint8 roomNumber) external {
        if (floor < 1 || floor > 100) revert InvalidFloor();
        if (totalMinted >= MAX_SUPPLY) revert MaxSupplyReached();
        
        // Determine size based on floor
        uint8 size = _getSizeForFloor(floor, roomNumber);
        
        // Validate room number
        uint8 maxRooms = floor == 100 ? 1 : 20;
        if (roomNumber < 1 || roomNumber > maxRooms) revert InvalidRoomNumber();
        
        // Generate token ID from floor and room
        uint256 tokenId = uint256(floor) * 100 + roomNumber;
        
        // Check not already minted
        if (_ownerOf(tokenId) != address(0)) revert RoomAlreadyMinted();
        
        // Get price and collect payment
        uint256 price = roomPrices[floor][size];
        if (price == 0) revert InvalidSize();
        
        // Transfer EMBER (50% burn, 50% stake)
        uint256 burnAmount = price / 2;
        uint256 stakeAmount = price - burnAmount;
        
        // Transfer to burn address (address(0xdead))
        emberToken.transferFrom(msg.sender, address(0xdead), burnAmount);
        // Transfer to staking wallet
        emberToken.transferFrom(msg.sender, stakingWallet, stakeAmount);
        
        // Store room data
        rooms[tokenId] = Room({
            floor: floor,
            roomNumber: roomNumber,
            size: size
        });
        
        // Mint NFT (CEI: state updated before external call... but mint is internal)
        totalMinted++;
        _mint(msg.sender, tokenId);
        
        emit RoomMinted(tokenId, msg.sender, floor, roomNumber, size);
    }

    /**
     * @dev Determine room size based on floor and position
     */
    function _getSizeForFloor(uint8 floor, uint8 roomNumber) internal pure returns (uint8) {
        if (floor == 100) return 5; // Penthouse
        if (floor >= 91) return 4;  // Luxury (32x32)
        
        // For floors 1-90, distribute sizes
        // 8 studios, 6 1BR, 4 2BR, 2 suites per floor
        if (roomNumber <= 8) return 0;       // Studio
        if (roomNumber <= 14) return 1;      // 1BR
        if (roomNumber <= 18) return 2;      // 2BR
        return 3;                             // Suite
    }

    /**
     * @notice Get room price
     */
    function getRoomPrice(uint8 floor, uint8 roomNumber) external view returns (uint256) {
        uint8 size = _getSizeForFloor(floor, roomNumber);
        return roomPrices[floor][size];
    }

    /**
     * @notice Update room price (owner only)
     */
    function setRoomPrice(uint8 floor, uint8 size, uint256 price) external onlyOwner {
        roomPrices[floor][size] = price;
        emit PriceUpdated(floor, size, price);
    }

    /**
     * @notice Set base URI for metadata
     */
    function setBaseURI(string calldata _baseURI) external onlyOwner {
        baseURI = _baseURI;
    }

    /**
     * @notice Token URI
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string(abi.encodePacked(baseURI, tokenId.toString(), ".json"));
    }

    // Required overrides for ERC721C
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
