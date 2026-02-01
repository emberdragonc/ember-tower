# Ember Tower Contracts - Planning

## One-Liner (5-Year-Old Test)
"Buy a room in a tower, put furniture in it, trade with friends - all as NFTs"

## Problem Statement
Need NFT contracts for:
1. Tower rooms (1,981 total, varying sizes/floors)
2. Furniture items (100+ items, tradeable)
3. Marketplace (buy/sell with EMBER, 50% burn / 50% stake)
4. Dragon egg merchant (daily limited sales)

## Success Criteria
- [x] ERC-721C for enforced royalties
- [x] Metadata includes floor, room number, size
- [x] All sales route 50% to burn, 50% to stakers
- [x] Secondary royalties 100% to stakers
- [x] Dragon eggs with hatch mechanism

## Scope

### IN SCOPE
- EmberTowerRooms.sol - Room NFTs
- EmberTowerItems.sol - Furniture NFTs
- EmberTowerMarketplace.sol - Trading
- DragonEggMerchant.sol - Egg sales + hatching

### OUT OF SCOPE (Phase 2)
- On-chain room state (furniture positions)
- Breeding mechanics
- Complex game logic

### NON-GOALS
- Storing room layouts on-chain (too expensive)
- User profiles on-chain (use database)

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| High gas for minting | Lazy mint / batch mint |
| Price manipulation | Fixed pricing tiers |
| Reentrancy | CEI pattern |
| Large supply (1,981 rooms) | Tiered release |

## Architecture

```
EmberTowerRooms (ERC-721C)
  - mint(floor, roomNumber, size)
  - tokenURI with metadata
  - 100% royalties to stakers
  
EmberTowerItems (ERC-721C)
  - mint(itemType, rarity)
  - batch mint support
  - 100% royalties to stakers

EmberTowerMarketplace
  - listForSale(tokenId, price)
  - buy(tokenId)
  - 50% burn / 50% stake split
  - Supports both Room and Item NFTs

DragonEggMerchant
  - buyEgg() - daily limited
  - hatch(eggId) - after 7 days
  - Random rarity determination
```

## Milestones

| Phase | Task | Time Est |
|-------|------|----------|
| 1 | EmberTowerRooms.sol | 2 hours |
| 2 | EmberTowerItems.sol | 1 hour |
| 3 | EmberTowerMarketplace.sol | 2 hours |
| 4 | DragonEggMerchant.sol | 2 hours |
| 5 | Tests + Self-Audit | 3 hours |
| 6 | External Audit Request | - |
| 7 | Testnet Deploy | 1 hour |
| 8 | Mainnet Deploy | 1 hour |

## Go/No-Go Checklist
- [x] One-liner defined
- [x] Requirements clear
- [x] Architecture documented
- [x] Risks identified
- [x] Ready to build!
