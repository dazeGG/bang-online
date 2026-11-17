import type { CardFace, CardKind, CharacterId, GameView, PublicResolution } from '@bang/contracts';

export const cards: Record<CardKind, { name: string; text: string }> = {
  bang: {
    name: 'Бэнг!',
    text: 'Выстрел в другого игрока в пределах дальности оружия. Обычно один «Бэнг!» за ход.',
  },
  missed: { name: 'Мимо!', text: 'Отменяет один эффект выстрела. Играется в ответ на атаку.' },
  beer: {
    name: 'Пиво',
    text: 'Восстанавливает одну жизнь, в том числе при спасении. Не действует, когда в живых осталось двое.',
  },
  saloon: {
    name: 'Салун',
    text: 'Каждый живой игрок восстанавливает одну жизнь, не выше максимума. Не применяется для спасения.',
  },
  stagecoach: { name: 'Дилижанс', text: 'Возьмите две карты из колоды.' },
  wells_fargo: { name: 'Уэллс Фарго', text: 'Возьмите три карты из колоды.' },
  general_store: {
    name: 'Магазин',
    text: 'Откройте по карте на каждого живого игрока. Выбирайте по одной, начиная с сыгравшего, по часовой стрелке.',
  },
  duel: {
    name: 'Дуэль',
    text: 'Противник и вы по очереди сбрасываете «Бэнг!». Первый отказавшийся теряет жизнь.',
  },
  gatling: {
    name: 'Гатлинг',
    text: 'Все остальные игроки отвечают «Мимо!» или теряют жизнь. Можно использовать защиту от выстрела.',
  },
  indians: {
    name: 'Индейцы!',
    text: 'Все остальные сбрасывают «Бэнг!» или теряют жизнь. «Бочка» здесь не помогает.',
  },
  panic: {
    name: 'Паника!',
    text: 'Заберите карту из руки вслепую или открытую карту со стола у игрока на расстоянии 1. Дальность оружия не учитывается.',
  },
  cat_balou: {
    name: 'Красотка Кэт',
    text: 'Сбросьте случайную карту из руки или выбранную открытую карту любого игрока.',
  },
  barrel: {
    name: 'Бочка',
    text: 'При выстреле можно сделать проверку: черва отменяет один эффект выстрела. Одна проверка «Бочки» на угрозу.',
  },
  dynamite: {
    name: 'Динамит',
    text: 'В начале хода проверка: пики от 2 до 9 — потеря трёх жизней. Иначе передайте динамит следующему живому игроку.',
  },
  jail: {
    name: 'Тюрьма',
    text: 'Кладётся перед другим игроком, кроме шерифа. В начале его хода черва освобождает, иначе ход пропускается. Затем сбрасывается.',
  },
  mustang: { name: 'Мустанг', text: 'Другие игроки видят вас на расстоянии на 1 больше.' },
  scope: {
    name: 'Прицел',
    text: 'Вы видите остальных игроков на расстоянии на 1 меньше, но не меньше 1.',
  },
  volcanic: {
    name: 'Вулканик',
    text: 'Дальность 1. Можно играть сколько угодно карт «Бэнг!» в свой ход.',
  },
  schofield: { name: 'Скофилд', text: 'Дальность оружия 2. Заменяет ранее выложенное оружие.' },
  remington: { name: 'Ремингтон', text: 'Дальность оружия 3. Заменяет ранее выложенное оружие.' },
  rev_carabine: { name: 'Карабин', text: 'Дальность оружия 4. Заменяет ранее выложенное оружие.' },
  winchester: { name: 'Винчестер', text: 'Дальность оружия 5. Заменяет ранее выложенное оружие.' },
};

export const characters: Record<CharacterId, { name: string; text: string }> = {
  bart_cassidy: {
    name: 'Барт Кэссиди',
    text: 'За каждую потерянную жизнь берёт карту после разрешения спасения.',
  },
  black_jack: {
    name: 'Чёрный Джек',
    text: 'Показывает вторую карту обычного добора. Если она красной масти, берёт третью.',
  },
  calamity_janet: {
    name: 'Бедовая Джейн',
    text: 'Может использовать «Бэнг!» как «Мимо!» и наоборот.',
  },
  el_gringo: {
    name: 'Эль Гринго',
    text: 'За каждую потерянную от другого игрока жизнь забирает случайную карту из его руки, если выжил.',
  },
  jesse_jones: {
    name: 'Джесси Джонс',
    text: 'Первую карту обычного добора может взять вслепую из руки другого игрока.',
  },
  jourdonnais: {
    name: 'Журдонне',
    text: 'Имеет собственную проверку на черву против выстрела. Работает дополнительно к «Бочке».',
  },
  kit_carlson: {
    name: 'Кит Карлсон',
    text: 'При доборе смотрит три карты, оставляет две, третью возвращает наверх колоды.',
  },
  lucky_duke: {
    name: 'Счастливчик Дюк',
    text: 'На каждой проверке открывает две карты и выбирает результат.',
  },
  paul_regret: {
    name: 'Пол Регрет',
    text: 'Остальные игроки видят его на расстоянии на 1 больше.',
  },
  pedro_ramirez: {
    name: 'Педро Рамирес',
    text: 'Первую карту обычного добора может взять с вершины сброса.',
  },
  rose_doolan: {
    name: 'Роза Дулан',
    text: 'Видит остальных на расстоянии на 1 меньше, но не меньше 1.',
  },
  sid_ketchum: {
    name: 'Сид Кетчум',
    text: 'Может в любой момент сбросить две карты из руки, чтобы восстановить жизнь, в том числе для спасения.',
  },
  slab_the_killer: {
    name: 'Слэб Убийца',
    text: 'Его «Бэнг!» требует двух эффектов «Мимо!». Успешная «Бочка» отменяет один.',
  },
  suzy_lafayette: {
    name: 'Сюзи Лафайет',
    text: 'Когда рука опустела, берёт карту. В дуэли и магазине добор откладывается до завершения эффекта.',
  },
  vulture_sam: {
    name: 'Стервятник Сэм',
    text: 'Получает карты руки и снаряжения выбывшего игрока.',
  },
  willy_the_kid: {
    name: 'Малыш Вилли',
    text: 'Может играть сколько угодно карт «Бэнг!» в свой ход.',
  },
};

export const roles: Record<GameView['ownRole'], { name: string; text: string }> = {
  sheriff: {
    name: 'Шериф',
    text: 'Устраните всех бандитов и ренегата. Помощники на вашей стороне.',
  },
  deputy: { name: 'Помощник', text: 'Защитите шерифа и помогите устранить бандитов и ренегата.' },
  outlaw: { name: 'Бандит', text: 'Устраните шерифа.' },
  renegade: { name: 'Ренегат', text: 'Останьтесь последним выжившим.' },
};
export const suits = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' } as const;
export const cardLabel = (card: CardFace) =>
  `${cards[card.kind].name} · ${card.rank}${suits[card.suit]}`;
export const equipmentKinds = new Set<CardKind>([
  'barrel',
  'dynamite',
  'jail',
  'scope',
  'mustang',
  'volcanic',
  'schofield',
  'remington',
  'rev_carabine',
  'winchester',
]);

export function resolutionText(entry: PublicResolution, game: GameView) {
  const name = (id: string) => game.players.find((player) => player.seatId === id)?.name ?? 'Игрок';
  const actor = name(entry.actorSeatId);
  const face = entry.card ? ` «${cardLabel(entry.card)}»` : '';
  switch (entry.kind) {
    case 'played':
      return `${actor} сыграл${face}${entry.targetSeatId ? ` → ${name(entry.targetSeatId)}` : ''}`;
    case 'check': {
      const laterCheck = game.publicResolutions.some(
        (candidate) =>
          candidate.kind === 'check' &&
          candidate.actorSeatId === entry.actorSeatId &&
          candidate.revision === entry.revision &&
          candidate.ordinal > entry.ordinal,
      );
      return `${actor}: ${laterCheck ? 'открыта для проверки' : 'результат проверки'}${face}`;
    }
    case 'black_jack_reveal':
      return `${actor} показал вторую карту добора${face}`;
    case 'damage':
      return `${actor} потерял жизней: ${entry.amount ?? 1}`;
    case 'healed':
      return `${actor} восстановил жизней: ${entry.amount ?? 1}`;
    case 'eliminated':
      return `${actor} выбыл`;
    case 'discarded':
      return `${actor} сбросил${face}`;
    case 'mass_resolved':
      return 'Массовая атака завершена';
  }
}
