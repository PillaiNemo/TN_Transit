// Tamil names for the demo cities, used as typographic accents (decoration only;
// the authoritative city list always comes from the cities table).
export const TAMIL_NAMES: Record<string, string> = {
  Chennai: 'சென்னை',
  Coimbatore: 'கோயம்புத்தூர்',
  Madurai: 'மதுரை',
  Tiruchirappalli: 'திருச்சி',
  Salem: 'சேலம்',
  Tirunelveli: 'திருநெல்வேலி',
  Erode: 'ஈரோடு',
  Thanjavur: 'தஞ்சாவூர்',
  Vellore: 'வேலூர்',
  Dindigul: 'திண்டுக்கல்',
  Kanyakumari: 'கன்னியாகுமரி',
  Tiruppur: 'திருப்பூர்',
  Rameswaram: 'இராமேசுவரம்',
  Kumbakonam: 'கும்பகோணம்',
  Udhagamandalam: 'உதகமண்டலம்',
};

export const tamilName = (city: string) => TAMIL_NAMES[city] ?? '';
