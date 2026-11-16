/**
 * Minimal translation layer. English is the source of truth. Hindi strings are machine-translated and marked
 * for native review (docs/I18N.md). Venue explanations and curated descriptions are not translated yet.
 */
export type Lang = 'en' | 'hi';

const STRINGS: Record<string, Record<Lang, string>> = {
  'calib.where': { en: 'Where are you heading?', hi: 'आप कहाँ जा रहे हैं?' },
  'calib.useLocation': { en: 'Use my location', hi: 'मेरी लोकेशन इस्तेमाल करें' },
  'calib.skip': { en: 'Skip — build with defaults', hi: 'छोड़ें — डिफ़ॉल्ट से बनाएँ' },
  'calib.sample': { en: 'See a sample day in Jaipur', hi: 'जयपुर का नमूना दिन देखें' },
  'calib.build': { en: 'Build my day', hi: 'मेरा दिन बनाएँ' },
  'calib.prefs': { en: 'Preferences and guardrails', hi: 'पसंद और सीमाएँ' },
  'adapt.title': { en: 'What changed?', hi: 'क्या बदला?' },
  'adapt.reshape': { en: 'Reshape rest of day', hi: 'बाकी दिन बदलें' },
  'adapt.reshaping': { en: 'Reshaping…', hi: 'बदल रहे हैं…' },
  'offline.message': { en: 'Offline mode — your plan and addresses are saved. Reconnect to adapt.', hi: 'ऑफ़लाइन मोड — आपका प्लान और पते सेव हैं। बदलने के लिए दोबारा कनेक्ट करें।' },
  'adapt.offline': { en: 'You’re offline — reconnect to recalculate new stops. Your current plan is saved below.', hi: 'आप ऑफ़लाइन हैं — नए स्टॉप के लिए दोबारा कनेक्ट करें। आपका मौजूदा प्लान नीचे सेव है।' },
  'undo.button': { en: 'Undo change', hi: 'बदलाव वापस लें' },
  'swap.choose': { en: 'Replace with this', hi: 'यह चुनें' },
  'prefs.title': { en: 'Preferences', hi: 'पसंद' },
  'prefs.reset': { en: 'Reset & delete all my data', hi: 'सारा डेटा मिटाएँ' },
  'prefs.save': { en: 'Save preferences', hi: 'पसंद सेव करें' },
  'prefs.language': { en: 'Language', hi: 'भाषा' },
  'nav.plan': { en: 'New plan', hi: 'नया प्लान' },
  'nav.today': { en: 'Today', hi: 'आज' },
  'nav.adapt': { en: 'Adapt my day', hi: 'दिन बदलें' },
  'nav.explore': { en: 'Explore', hi: 'खोजें' },
  'nav.map': { en: 'Nearby map', hi: 'आस-पास का नक्शा' }
};

let current: Lang = 'en';
const KEY = 'planb_lang';

export function getLang(): Lang {
  try { return (localStorage.getItem(KEY) === 'hi' ? 'hi' : 'en'); } catch { return 'en'; }
}
export function setLang(l: Lang): void {
  current = l;
  try { localStorage.setItem(KEY, l); } catch { /* private mode: language just won't persist */ }
}
current = getLang();

export function t(key: string): string {
  const entry = STRINGS[key];
  if (!entry) return key;
  return entry[current] ?? entry.en;
}
