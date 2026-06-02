export interface RewardLine {
  label: string;
  amount: number;
}

export interface RewardBreakdown {
  lines: RewardLine[];
  total: number;
}

interface StatsInput {
  role: 'survivor' | 'professor';
  outcome?: 'escaped' | 'expelled' | 'downed';
  hackContributed?: number;
  healsGiven?: number;
  hitsLanded?: number;
  downedCount?: number;
  expelledCount?: number;
}

export function calculateReward(stats: StatsInput, winner: string): RewardBreakdown {
  const lines: RewardLine[] = [];

  const add = (label: string, amount: number) => {
    if (amount > 0) lines.push({ label, amount });
  };

  add('Participação', 15);

  if (stats.role === 'survivor') {
    if (stats.outcome === 'escaped')       add('Fugiu', 45);
    else if (stats.outcome === 'downed')   add('Não foi expulso', 15);
    else if (stats.outcome === 'expelled') add('Foi expulso', 5);

    const hackPct   = stats.hackContributed ?? 0;
    const hackBonus = Math.round(hackPct * 0.3);
    if (hackBonus > 0) add(`Terminais (${hackPct}%)`, hackBonus);

    add('Curas dadas', (stats.healsGiven ?? 0) * 5);
  } else {
    add(winner === 'professor' ? 'Venceu' : 'Perdeu', winner === 'professor' ? 80 : 10);
    add('Expulsões', (stats.expelledCount ?? 0) * 15);
    add('Derrubadas', (stats.downedCount  ?? 0) * 5);
    add('Ataques acertados', stats.hitsLanded ?? 0);
  }

  const total = Math.min(lines.reduce((sum, l) => sum + l.amount, 0), 200);
  return { lines, total };
}
