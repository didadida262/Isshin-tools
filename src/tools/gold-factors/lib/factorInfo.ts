export interface FactorInfoContent {
  definition: string
  goldImpact: string
}

/** Educational copy keyed by FactorMetric.id (grid factors only). */
export const FACTOR_INFO: Record<string, FactorInfoContent> = {
  'real-yield-10y': {
    definition:
      '10 年期实际利率通常用美国 TIPS（通胀保值国债）的实际收益率表示，衡量剔除通胀后的无风险回报。它反映持有现金/国债相对持有黄金的机会成本。',
    goldImpact:
      '实际利率上升 → 持有生息资产更具吸引力，黄金机会成本提高，通常压制金价。实际利率下降 → 机会成本降低，往往利多黄金。经验上这是黄金中长期定价的核心变量之一。',
  },
  dxy: {
    definition:
      '美元指数（本工具用新浪 DINIW 代理）衡量美元相对一篮子主要货币的强弱。黄金以美元计价，美元本身也是全球储备与融资货币。',
    goldImpact:
      '美元走强 → 非美买家购买黄金更贵，且风险资产与美元资产吸引力上升，金价常承压。美元走弱 → 黄金美元价格更容易上涨。相关关系并非时时一一对应，但方向上多为负相关。',
  },
  'breakeven-10y': {
    definition:
      '10 年期盈亏平衡通胀近似等于「名义利率 − 实际利率」，是市场对未来通胀的隐含预期代理（本工具由美债曲线推算，并非 FRED T10YIE 原序列）。',
    goldImpact:
      '通胀预期抬升 → 实际利率往往承压、货币购买力担忧升温，通常利多黄金。通胀预期回落 → 对黄金的通胀对冲需求减弱，偏中性或利空。需结合实际利率一起看，避免单看名义变化。',
  },
  'nominal-10y': {
    definition:
      '10 年期美债名义收益率是市场对未来增长、通胀与货币政策路径的综合定价，是全球资产定价的基准利率之一。',
    goldImpact:
      '名义利率上行若由实际利率推动，通常利空黄金；若主要由通胀预期推动，对黄金影响更复杂，甚至可能偏多。因此应拆成「实际利率 + 盈亏平衡通胀」解读，而不是只盯名义利率涨跌。',
  },
  'fed-funds': {
    definition:
      '联邦基金利率是美联储 FOMC 设定的隔夜政策利率目标（本工具取 Trading Economics 公布的决议水平，通常对应目标区间上沿）。它与 10 年期美债收益率不是同一指标：前者是短期政策利率，后者是长端市场定价。',
    goldImpact:
      '政策利率上调抬高持币/持债的机会成本，通常压制金价；降息则降低机会成本，往往利多黄金。实际传导还取决于加息/降息是否已被市场充分计价，以及实际利率与美元的同步变化。',
  },
  'vix-proxy': {
    definition:
      '本工具用 VIXY（短期 VIX 期货 ETF）作为风险偏好/波动率的弱代理，并非芝加哥期权交易所的 VIX 现货指数本身，且存在期货升贴水与衰减特征。',
    goldImpact:
      '风险偏好恶化、波动上升时，黄金有时发挥避险资产作用而受益；但若流动性危机迫使抛售一切资产，黄金也可能同步承压。因此「风险升 → 金价必涨」并不成立，需结合美元与实际利率环境。',
  },
  'cb-gold': {
    definition:
      '央行净购金指全球各国官方储备中黄金的月度净买入合计（吨），并非中国央行单家数据。统计多来自世界黄金协会（WGC）对 IMF/各国披露的汇总，发布通常滞后 1–2 个月。',
    goldImpact:
      '全球央行持续净买入会形成中长期结构性需求，偏利多黄金；若转为净卖出，则削弱这一支撑。该指标低频，更适合判断中期供需背景，而非解释日内波动。',
  },
}

export function getFactorInfo(id: string): FactorInfoContent | null {
  return FACTOR_INFO[id] ?? null
}
