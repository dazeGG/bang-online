export type CardKind =
  | 'barrel'
  | 'dynamite'
  | 'scope'
  | 'mustang'
  | 'jail'
  | 'remington'
  | 'rev_carabine'
  | 'schofield'
  | 'volcanic'
  | 'winchester'
  | 'bang'
  | 'beer'
  | 'cat_balou'
  | 'stagecoach'
  | 'duel'
  | 'general_store'
  | 'gatling'
  | 'indians'
  | 'missed'
  | 'panic'
  | 'saloon'
  | 'wells_fargo';
export type CardSuit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type CardRank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';
export type CharacterId =
  | 'bart_cassidy'
  | 'black_jack'
  | 'calamity_janet'
  | 'el_gringo'
  | 'jesse_jones'
  | 'jourdonnais'
  | 'kit_carlson'
  | 'lucky_duke'
  | 'paul_regret'
  | 'pedro_ramirez'
  | 'rose_doolan'
  | 'sid_ketchum'
  | 'slab_the_killer'
  | 'suzy_lafayette'
  | 'vulture_sam'
  | 'willy_the_kid';
export interface CardFace {
  kind: CardKind;
  suit: CardSuit;
  rank: CardRank;
}
export interface CardInstance extends CardFace {
  id: string;
}
export interface CharacterDefinition {
  id: CharacterId;
  name: string;
  maxHp: number;
  ability: string;
  source: string;
}
export const CLASSIC_CATALOG_VERSION = 'classic-iv-2026-11-17' as const;
export const CLASSIC_CATALOG_SOURCES = {
  edition: 'Classic BANG! Fourth edition; publisher base-game catalog id=1',
  retrievedDate: '2026-11-17',
  sources: [
    {
      url: 'https://bang.dvgiochi.com/list_download.php?id=1',
      sha256: 'E9F0E7B28275686921230988AE9411F41C42DFD1BCC6D9D26BD1A7BD89665652',
    },
    {
      url: 'https://www.dvgiochi.com/giochi/bang/download/BANG%21%20Card%20List.pdf',
      sha256: 'EDD5215E0F4F939FBD8E564A2D7035EEB52BD6826EECE2E4008466D53DCF8740',
    },
    {
      url: 'https://www.dvgiochi.com/giochi/bang/download/Bang_rules_ENG.pdf',
      sha256: '08001B2C4EBB606CB1A0831B85E1A1C1A61E85A3DBD64BC2AE14D1CE8425871D',
    },
    {
      url: 'https://www.dvgiochi.com/giochi/bang/download/Bang!_FAQ_ENG.pdf',
      sha256: '9D736344FF1C4FB9552D46AE8EBBE26EFCC1C6699308467BE3BFD61E48B5CAD6',
    },
  ],
} as const;
/** Physical occurrences, not a set of unique faces. Stable IDs are private while hidden. */
export const CLASSIC_DECK: readonly CardInstance[] = [
  { id: 'classic-001', kind: 'barrel', suit: 'spades', rank: 'Q' },
  { id: 'classic-002', kind: 'barrel', suit: 'spades', rank: 'K' },
  { id: 'classic-003', kind: 'dynamite', suit: 'hearts', rank: '2' },
  { id: 'classic-004', kind: 'scope', suit: 'spades', rank: 'A' },
  { id: 'classic-005', kind: 'mustang', suit: 'hearts', rank: '8' },
  { id: 'classic-006', kind: 'mustang', suit: 'hearts', rank: '9' },
  { id: 'classic-007', kind: 'jail', suit: 'spades', rank: 'J' },
  { id: 'classic-008', kind: 'jail', suit: 'spades', rank: '10' },
  { id: 'classic-009', kind: 'jail', suit: 'hearts', rank: '4' },
  { id: 'classic-010', kind: 'remington', suit: 'clubs', rank: 'K' },
  { id: 'classic-011', kind: 'rev_carabine', suit: 'clubs', rank: 'A' },
  { id: 'classic-012', kind: 'schofield', suit: 'clubs', rank: 'J' },
  { id: 'classic-013', kind: 'schofield', suit: 'clubs', rank: 'Q' },
  { id: 'classic-014', kind: 'schofield', suit: 'spades', rank: 'K' },
  { id: 'classic-015', kind: 'volcanic', suit: 'spades', rank: '10' },
  { id: 'classic-016', kind: 'volcanic', suit: 'clubs', rank: '10' },
  { id: 'classic-017', kind: 'winchester', suit: 'spades', rank: '8' },
  { id: 'classic-018', kind: 'bang', suit: 'spades', rank: 'A' },
  { id: 'classic-019', kind: 'bang', suit: 'diamonds', rank: '2' },
  { id: 'classic-020', kind: 'bang', suit: 'diamonds', rank: '3' },
  { id: 'classic-021', kind: 'bang', suit: 'diamonds', rank: '4' },
  { id: 'classic-022', kind: 'bang', suit: 'diamonds', rank: '5' },
  { id: 'classic-023', kind: 'bang', suit: 'diamonds', rank: '6' },
  { id: 'classic-024', kind: 'bang', suit: 'diamonds', rank: '7' },
  { id: 'classic-025', kind: 'bang', suit: 'diamonds', rank: '8' },
  { id: 'classic-026', kind: 'bang', suit: 'diamonds', rank: '9' },
  { id: 'classic-027', kind: 'bang', suit: 'diamonds', rank: '10' },
  { id: 'classic-028', kind: 'bang', suit: 'diamonds', rank: 'J' },
  { id: 'classic-029', kind: 'bang', suit: 'diamonds', rank: 'Q' },
  { id: 'classic-030', kind: 'bang', suit: 'diamonds', rank: 'K' },
  { id: 'classic-031', kind: 'bang', suit: 'diamonds', rank: 'A' },
  { id: 'classic-032', kind: 'bang', suit: 'clubs', rank: '2' },
  { id: 'classic-033', kind: 'bang', suit: 'clubs', rank: '3' },
  { id: 'classic-034', kind: 'bang', suit: 'clubs', rank: '4' },
  { id: 'classic-035', kind: 'bang', suit: 'clubs', rank: '5' },
  { id: 'classic-036', kind: 'bang', suit: 'clubs', rank: '6' },
  { id: 'classic-037', kind: 'bang', suit: 'clubs', rank: '7' },
  { id: 'classic-038', kind: 'bang', suit: 'clubs', rank: '8' },
  { id: 'classic-039', kind: 'bang', suit: 'clubs', rank: '9' },
  { id: 'classic-040', kind: 'bang', suit: 'hearts', rank: 'Q' },
  { id: 'classic-041', kind: 'bang', suit: 'hearts', rank: 'K' },
  { id: 'classic-042', kind: 'bang', suit: 'hearts', rank: 'A' },
  { id: 'classic-043', kind: 'beer', suit: 'hearts', rank: '6' },
  { id: 'classic-044', kind: 'beer', suit: 'hearts', rank: '7' },
  { id: 'classic-045', kind: 'beer', suit: 'hearts', rank: '8' },
  { id: 'classic-046', kind: 'beer', suit: 'hearts', rank: '9' },
  { id: 'classic-047', kind: 'beer', suit: 'hearts', rank: '10' },
  { id: 'classic-048', kind: 'beer', suit: 'hearts', rank: 'J' },
  { id: 'classic-049', kind: 'cat_balou', suit: 'hearts', rank: 'K' },
  { id: 'classic-050', kind: 'cat_balou', suit: 'diamonds', rank: '9' },
  { id: 'classic-051', kind: 'cat_balou', suit: 'diamonds', rank: '10' },
  { id: 'classic-052', kind: 'cat_balou', suit: 'diamonds', rank: 'J' },
  { id: 'classic-053', kind: 'stagecoach', suit: 'spades', rank: '9' },
  { id: 'classic-054', kind: 'stagecoach', suit: 'spades', rank: '9' },
  { id: 'classic-055', kind: 'duel', suit: 'diamonds', rank: 'Q' },
  { id: 'classic-056', kind: 'duel', suit: 'spades', rank: 'J' },
  { id: 'classic-057', kind: 'duel', suit: 'clubs', rank: '8' },
  { id: 'classic-058', kind: 'general_store', suit: 'clubs', rank: '9' },
  { id: 'classic-059', kind: 'general_store', suit: 'spades', rank: 'Q' },
  { id: 'classic-060', kind: 'gatling', suit: 'hearts', rank: '10' },
  { id: 'classic-061', kind: 'indians', suit: 'diamonds', rank: 'K' },
  { id: 'classic-062', kind: 'indians', suit: 'diamonds', rank: 'A' },
  { id: 'classic-063', kind: 'missed', suit: 'clubs', rank: '10' },
  { id: 'classic-064', kind: 'missed', suit: 'clubs', rank: 'J' },
  { id: 'classic-065', kind: 'missed', suit: 'clubs', rank: 'Q' },
  { id: 'classic-066', kind: 'missed', suit: 'clubs', rank: 'K' },
  { id: 'classic-067', kind: 'missed', suit: 'clubs', rank: 'A' },
  { id: 'classic-068', kind: 'missed', suit: 'spades', rank: '2' },
  { id: 'classic-069', kind: 'missed', suit: 'spades', rank: '3' },
  { id: 'classic-070', kind: 'missed', suit: 'spades', rank: '4' },
  { id: 'classic-071', kind: 'missed', suit: 'spades', rank: '5' },
  { id: 'classic-072', kind: 'missed', suit: 'spades', rank: '6' },
  { id: 'classic-073', kind: 'missed', suit: 'spades', rank: '7' },
  { id: 'classic-074', kind: 'missed', suit: 'spades', rank: '8' },
  { id: 'classic-075', kind: 'panic', suit: 'hearts', rank: 'J' },
  { id: 'classic-076', kind: 'panic', suit: 'hearts', rank: 'Q' },
  { id: 'classic-077', kind: 'panic', suit: 'hearts', rank: 'A' },
  { id: 'classic-078', kind: 'panic', suit: 'diamonds', rank: '8' },
  { id: 'classic-079', kind: 'saloon', suit: 'hearts', rank: '5' },
  { id: 'classic-080', kind: 'wells_fargo', suit: 'hearts', rank: '3' },
];
export const CLASSIC_CHARACTERS: readonly CharacterDefinition[] = [
  {
    id: 'bart_cassidy',
    maxHp: 4,
    ability: 'Draw per lost HP after surviving; lethal rescue precedes draw.',
    name: 'Bart Cassidy',
    source: 'Fourth-edition rulebook pp.10-11; FAQ Q17-Q26',
  },
  {
    id: 'black_jack',
    maxHp: 4,
    ability: 'Reveal second phase-one draw; red suit grants one extra hidden draw.',
    name: 'Black Jack',
    source: 'Fourth-edition rulebook pp.10-11; FAQ Q17-Q26',
  },
  {
    id: 'calamity_janet',
    maxHp: 4,
    ability: 'Interchange Bang and Missed; normal played-Bang limit applies.',
    name: 'Calamity Janet',
    source: 'Fourth-edition rulebook pp.10-11; FAQ Q17-Q26',
  },
  {
    id: 'el_gringo',
    maxHp: 3,
    ability:
      'After surviving damage from another card player, randomly take their hand card per lost HP.',
    name: 'El Gringo',
    source: 'Fourth-edition rulebook pp.10-11; FAQ Q17-Q26',
  },
  {
    id: 'jesse_jones',
    maxHp: 4,
    ability: 'First phase-one draw may randomly take another hand card; second from deck.',
    name: 'Jesse Jones',
    source: 'Fourth-edition rulebook pp.10-11; FAQ Q17-Q26',
  },
  {
    id: 'jourdonnais',
    maxHp: 4,
    ability: 'Innate Barrel check, stacking with actual Barrel.',
    name: 'Jourdonnais',
    source: 'Fourth-edition rulebook pp.10-11; FAQ Q17-Q26',
  },
  {
    id: 'kit_carlson',
    maxHp: 4,
    ability: 'Phase one: inspect three, keep two, return third atop deck.',
    name: 'Kit Carlson',
    source: 'Fourth-edition rulebook pp.10-11; FAQ Q17-Q26',
  },
  {
    id: 'lucky_duke',
    maxHp: 4,
    ability: 'Draw checks reveal two; choose result; discard both.',
    name: 'Lucky Duke',
    source: 'Fourth-edition rulebook pp.10-11; FAQ Q17-Q26',
  },
  {
    id: 'paul_regret',
    maxHp: 3,
    ability: 'Incoming distance +1, stacking with Mustang.',
    name: 'Paul Regret',
    source: 'Fourth-edition rulebook pp.10-11; FAQ Q17-Q26',
  },
  {
    id: 'pedro_ramirez',
    maxHp: 4,
    ability: 'First phase-one draw may take discard top; second from deck.',
    name: 'Pedro Ramirez',
    source: 'Fourth-edition rulebook pp.10-11; FAQ Q17-Q26',
  },
  {
    id: 'rose_doolan',
    maxHp: 4,
    ability: 'Outgoing distance -1, stacking with Scope; minimum one.',
    name: 'Rose Doolan',
    source: 'Fourth-edition rulebook pp.10-11; FAQ Q17-Q26',
  },
  {
    id: 'sid_ketchum',
    maxHp: 4,
    ability: 'Discard two owned hand cards to heal one HP, including outside own turn; repeatable.',
    name: 'Sid Ketchum',
    source: 'Fourth-edition rulebook pp.10-11; FAQ Q17-Q26',
  },
  {
    id: 'slab_the_killer',
    maxHp: 4,
    ability: 'Bang cards require two Missed effects.',
    name: 'Slab The Killer',
    source: 'Fourth-edition rulebook pp.10-11; FAQ Q17-Q26',
  },
  {
    id: 'suzy_lafayette',
    maxHp: 4,
    ability: 'Empty hand triggers draw; timing exceptions in evidence.',
    name: 'Suzy Lafayette',
    source: 'Fourth-edition rulebook pp.10-11; FAQ Q17-Q26',
  },
  {
    id: 'vulture_sam',
    maxHp: 4,
    ability: "Take eliminated player's hand and board cards into hand.",
    name: 'Vulture Sam',
    source: 'Fourth-edition rulebook pp.10-11; FAQ Q17-Q26',
  },
  {
    id: 'willy_the_kid',
    maxHp: 4,
    ability: 'Unlimited Bang cards during own turn.',
    name: 'Willy The Kid',
    source: 'Fourth-edition rulebook pp.10-11; FAQ Q17-Q26',
  },
];
/** FAQ uses Burt; both labels identify the same single character. */
export const CHARACTER_ALIASES = { burt_cassidy: 'bart_cassidy' } as const;
