/**
 * Turns a spoken (or typed) sentence into the same "what changed" chips the Adapt sheet already has.
 * Deterministic keyword matching in English, Hindi (Devanagari) and common Hinglish spellings. It only PRE-SELECTS chips:
 * the traveler always confirms, and nothing here is ever sent as an instruction to the AI.
 */
export type Scenario = 'running_late' | 'low_battery' | 'weather_turned' | 'hungry_now' | 'shift_social' | 'early_night';
export interface VoiceIntent { scenarios: Scenario[]; socialShift?: 'quieter' | 'livelier'; note: string }

const RULES: Array<{ id: Scenario; words: RegExp }> = [
  { id: 'weather_turned', words: /\b(rain|raining|rainy|storm|drizzle|wet|monsoon|barish|baarish|baarish|thunder)\b|बारिश|बरसात|तूफ़ान|तूफान/i },
  { id: 'low_battery', words: /\b(battery|tired|tiring|exhaust\w*|sleepy|low energy|worn out|thak|thaka|thak gaya|thak gayi|rest)\b|थक|थकान|बैटरी|आराम/i },
  { id: 'running_late', words: /\b(late|behind|delayed|running late|slow|der|deri)\b|देर|लेट/i },
  { id: 'hungry_now', words: /\b(hungry|starving|food|eat|lunch|dinner|snack|bhook|bhuk|khana|khaana)\b|भूख|खाना|खाने/i },
  { id: 'early_night', words: /\b(early night|head back|go back|call it a day|done for (the )?day|hotel|hostel|ghar|wapas)\b|वापस|घर|होटल|हॉस्टल/i }
];
const QUIET = /\b(quiet|quieter|calm|peaceful|alone|crowd|crowded|shant)\b|शांत|भीड़|भीड/i;
const LIVELY = /\b(lively|livelier|busy|buzz|social|people|fun|music|crowds? is fine)\b|चहल|मज़ेदार|लोग/i;

export function parseVoiceIntent(text: string): VoiceIntent {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 140);
  const scenarios = RULES.filter(r => r.words.test(clean)).map(r => r.id);
  let socialShift: VoiceIntent['socialShift'];
  if (LIVELY.test(clean) && !QUIET.test(clean)) { socialShift = 'livelier'; scenarios.push('shift_social'); }
  else if (QUIET.test(clean)) { socialShift = 'quieter'; scenarios.push('shift_social'); }
  return { scenarios: [...new Set(scenarios)], socialShift, note: clean };
}
