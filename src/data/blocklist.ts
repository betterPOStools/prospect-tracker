export const DEFAULT_BLOCKLIST: string[] = [
  // Fast food
  "mcdonald's", 'mcdonalds', "wendy's", 'wendys', "arby's", 'arbys',
  'burger king', 'taco bell', 'chick-fil-a', 'chickfila', 'subway',
  "domino's", 'dominoes', 'pizza hut', 'little caesars', "papa john's",
  'sonic drive', "hardee's", 'hardees', 'bojangles', 'cook out', 'cookout',
  "zaxby's", 'zaxbys', 'raising cane', 'popeyes', "popeye's", 'kfc',
  'dairy queen', "steak 'n shake", 'five guys', 'whataburger', 'jack in the box',
  "carl's jr", 'carls jr', 'del taco', 'wingstop', 'jersey mike',
  'jimmy john', 'firehouse sub', 'potbelly', 'schlotzsky',
  // Casual chains
  "applebee's", 'applebees', "chili's", 'chilis', "denny's", 'dennys',
  'ihop', 'olive garden', 'outback steakhouse', 'longhorn steakhouse',
  'red lobster', 'texas roadhouse', 'golden corral', 'cracker barrel',
  'waffle house', 'bob evans', 'perkins', "shari's",
  'ruby tuesday', 'fridays', 'tgi friday', 'buffalo wild wings', 'bdubs',
  'hooters', 'red robin', "o'charley's", 'ocharleys',
  "joe's crab", "joe's seafood", "captain d's", 'captain ds', 'long john silver',
  // Pizza chains
  'papa murphy', 'papa murphys', 'pizza inn', 'cicis', "cici's", 'godfather',
  // Coffee/cafe chains
  'starbucks', 'dunkin', 'panera', 'einstein bagel', 'caribou coffee',
  // Hotel / resort / grocery food
  'marriott', 'hilton', 'holiday inn', 'hampton inn', 'doubletree',
  'walmart deli', 'publix deli', 'kroger',
  // Gas station food
  'sheetz', 'wawa', "buccee's", "buc-ee's", 'pilot flying j',
]

const DEFAULT_BLOCKLIST_LOWER = DEFAULT_BLOCKLIST.map((t) => t.toLowerCase())

export function isBlocklisted(name: string, blocklist?: string[]): boolean {
  const lower = (name ?? '').toLowerCase()
  const terms = blocklist ? blocklist.map((t) => t.toLowerCase()) : DEFAULT_BLOCKLIST_LOWER
  return terms.some((term) => lower.includes(term))
}

const STORAGE_KEY = 'vs_blocklist'

/** Add a term to the persisted blocklist (localStorage). No-op if already present. */
export function addToBlocklist(name: string): void {
  const trimmed = name.trim().toLowerCase()
  if (!trimmed) return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const terms: string[] = raw ? (JSON.parse(raw) as string[]) : [...DEFAULT_BLOCKLIST]
    if (terms.includes(trimmed)) return
    terms.push(trimmed)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(terms))
  } catch {
    // If localStorage fails, silently ignore
  }
}
