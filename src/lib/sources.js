/**
 * Source identity for the UI.
 *
 * The five marks are a ramp derived from the brand palette itself - violet through
 * periwinkle-grey to the two peach tones - so five distinguishable badges never introduce
 * a colour from outside the system.
 */
export const SOURCE_STYLE = {
  bancs: { mark: 'BA', colour: '#6e5be0', tint: '#ece9ff' },
  awsConnect: { mark: 'AW', colour: '#9381ff', tint: '#efecff' },
  azure: { mark: 'AZ', colour: '#8189c4', tint: '#eceefa' },
  tracker: { mark: 'TR', colour: '#d1843d', tint: '#ffeedd' },
  emailFeed: { mark: 'EM', colour: '#c0714f', tint: '#fbe6da' },
};

export const styleFor = (id) => SOURCE_STYLE[id] ?? { mark: '??', colour: '#9a94be', tint: '#f2f0fb' };

export const SOURCE_ORDER = ['bancs', 'awsConnect', 'azure', 'tracker', 'emailFeed'];
