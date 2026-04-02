import type { ServicePattern } from "../types";

export const SERVICE_PATTERNS: Record<string, ServicePattern> = {
  // Food & Grocery Delivery
  picnic: {
    sender: /@picnic\.app$/i,
    subject: /(freunde|freund|einladung|invite|rabatt|discount)/i,
    code: {
      inUrl: /\/freunde-rabatt\/([A-Z0-9]+)/i,
      inBody: /(?:code|einladung|invite)\s*[:\-]?\s*([A-Z0-9]{6,})/i,
    },
    urlPatterns: [
      /https?:\/\/[^\s]*picnic\.app[^\s]*\/freunde-rabatt\/[^\s]*/i,
      /https?:\/\/[^\s]*picnic\.app[^\s]*\/invite\/[^\s]*/i,
    ],
    reward: /(\d+\s*€\s*(?:rabatt|gutschrift|credit))/i,
    expiry: /(?:gültig\s*bis|expires?|valid\s*until)\s*[:\-]?\s*(.+)/i,
    serviceName: "Picnic",
    category: "food_delivery",
    priority: 100,
  },

  doordash: {
    sender: /@doordash\.com$/i,
    subject: /(invite|referral|free delivery|credit)/i,
    code: {
      inUrl: /doordash\.com\/invite\/([a-zA-Z0-9_-]+)/i,
      inBody: /(?:promo\s*code|invite\s*code)\s*[:\-]?\s*([A-Z0-9]+)/i,
    },
    urlPatterns: [/https?:\/\/[^\s]*doordash\.com\/invite\/[^\s]*/i],
    reward: /(\$?\d+\s*(?:off|credit|delivery))/i,
    expiry: /(?:expires?|valid\s*until)\s*[:\-]?\s*(.+)/i,
    serviceName: "DoorDash",
    category: "food_delivery",
    priority: 95,
  },

  ubereats: {
    sender: /@uber\.com$/i,
    subject: /(eats|food delivery|free meal|credit)/i,
    code: {
      inUrl: /ubereats\.com\/invite\/([a-zA-Z0-9_-]+)/i,
      inBody: /(?:eats\s*code|promo\s*code)\s*[:\-]?\s*([A-Z0-9]+)/i,
    },
    urlPatterns: [/https?:\/\/[^\s]*ubereats\.com\/invite\/[^\s]*/i],
    reward: /(\$?\d+\s*(?:off|credit|meal))/i,
    expiry: /(?:expires?|valid\s*until)\s*[:\-]?\s*(.+)/i,
    serviceName: "Uber Eats",
    category: "food_delivery",
    priority: 95,
  },

  grubhub: {
    sender: /@grubhub\.com$/i,
    subject: /(invite|referral|free food|credit)/i,
    code: {
      inUrl: /grubhub\.com\/referral\/([a-zA-Z0-9_-]+)/i,
      inBody: /(?:promo\s*code|referral\s*code)\s*[:\-]?\s*([A-Z0-9]+)/i,
    },
    urlPatterns: [/https?:\/\/[^\s]*grubhub\.com\/referral\/[^\s]*/i],
    reward: /(\$?\d+\s*(?:off|credit))/i,
    expiry: /(?:expires?|valid\s*until)\s*[:\-]?\s*(.+)/i,
    serviceName: "Grubhub",
    category: "food_delivery",
    priority: 90,
  },

  // Transportation
  uber: {
    sender: /@uber\.com$/i,
    subject: /(free ride|invite|referral|credit)/i,
    code: {
      inUrl: /uber\.com\/invite\/([a-zA-Z0-9_-]+)/i,
      inBody:
        /(?:promo\s*code|invite\s*code|your\s*code)\s*[:\-]?\s*([A-Z0-9]+)/i,
    },
    urlPatterns: [
      /https?:\/\/[^\s]*uber\.com\/invite\/[^\s]*/i,
      /https?:\/\/[^\s]*uber\.com\/i\/[^\s]*/i,
    ],
    reward: /(\$?\d+\s*(?:ride|credit|off))/i,
    expiry: /(?:valid\s*until|expires?)\s*[:\-]?\s*(.+)/i,
    serviceName: "Uber",
    category: "transportation",
    priority: 100,
  },

  lyft: {
    sender: /@lyft\.com$/i,
    subject: /(free ride|credit|invite|referral)/i,
    code: {
      inUrl: /lyft\.com\/i\/([a-zA-Z0-9_-]+)/i,
      inBody: /(?:code|promo)\s*[:\-]?\s*([A-Z0-9]+)/i,
    },
    urlPatterns: [
      /https?:\/\/[^\s]*lyft\.com\/i\/[^\s]*/i,
      /https?:\/\/[^\s]*lyft\.com\/invite\/[^\s]*/i,
    ],
    reward: /(\$?\d+\s*(?:ride|credit|off))/i,
    expiry: /(?:expires?|valid\s*until)\s*[:\-]?\s*(.+)/i,
    serviceName: "Lyft",
    category: "transportation",
    priority: 95,
  },

  lime: {
    sender: /@li\.me$/i,
    subject: /(free ride|unlock|credit|invite)/i,
    code: {
      inUrl: /lime\.bike\/referral\/([a-zA-Z0-9_-]+)/i,
      inBody: /(?:code|promo)\s*[:\-]?\s*([A-Z0-9]+)/i,
    },
    urlPatterns: [
      /https?:\/\/[^\s]*lime\.bike\/[^\s]*/i,
      /https?:\/\/[^\s]*li\.me\/[^\s]*/i,
    ],
    reward: /(\$?\d+\s*(?:ride|credit|unlock))/i,
    expiry: /(?:expires?|valid\s*until)\s*[:\-]?\s*(.+)/i,
    serviceName: "Lime",
    category: "transportation",
    priority: 85,
  },

  bird: {
    sender: /@bird\.co$/i,
    subject: /(free ride|unlock|credit|invite)/i,
    code: {
      inUrl: /bird\.co\/referral\/([a-zA-Z0-9_-]+)/i,
      inBody: /(?:code|promo)\s*[:\-]?\s*([A-Z0-9]+)/i,
    },
    urlPatterns: [/https?:\/\/[^\s]*bird\.co\/[^\s]*/i],
    reward: /(\$?\d+\s*(?:ride|credit|unlock))/i,
    expiry: /(?:expires?|valid\s*until)\s*[:\-]?\s*(.+)/i,
    serviceName: "Bird",
    category: "transportation",
    priority: 85,
  },

  // Travel & Accommodation
  airbnb: {
    sender: /@airbnb\.com$/i,
    subject: /(invite|credit|referral|travel)/i,
    code: {
      inUrl: /airbnb\.com\/c\/([a-zA-Z0-9_-]+)/i,
      inBody: /(?:join\s*with\s*code|use\s*code)\s*[:\-]?\s*([a-zA-Z0-9]+)/i,
    },
    urlPatterns: [/https?:\/\/[^\s]*airbnb\.com\/c\/[^\s]*/i],
    reward: /(\$?\d+\s*(?:credit|off|toward))/i,
    expiry: /(?:expires?|book\s*by|travel\s*by)\s*[:\-]?\s*(.+)/i,
    serviceName: "Airbnb",
    category: "travel",
    priority: 100,
  },

  booking: {
    sender: /@booking\.com$/i,
    subject: /(invite|discount|referral|genius)/i,
    code: {
      inUrl: /booking\.com\/referral\/([a-zA-Z0-9_-]+)/i,
      inBody: /(?:code|referral)\s*[:\-]?\s*([A-Z0-9]+)/i,
    },
    urlPatterns: [/https?:\/\/[^\s]*booking\.com\/referral\/[^\s]*/i],
    reward: /(\$?\d+\s*(?:off|discount|credit))/i,
    expiry: /(?:expires?|valid\s*until)\s*[:\-]?\s*(.+)/i,
    serviceName: "Booking.com",
    category: "travel",
    priority: 90,
  },

  expedia: {
    sender: /@expedia\.com$/i,
    subject: /(invite|reward|referral)/i,
    code: {
      inUrl: /expedia\.com\/referral\/([a-zA-Z0-9_-]+)/i,
      inBody: /(?:code|referral)\s*[:\-]?\s*([A-Z0-9]+)/i,
    },
    urlPatterns: [/https?:\/\/[^\s]*expedia\.com\/referral\/[^\s]*/i],
    reward: /(\$?\d+\s*(?:off|discount|credit))/i,
    expiry: /(?:expires?|valid\s*until)\s*[:\-]?\s*(.+)/i,
    serviceName: "Expedia",
    category: "travel",
    priority: 85,
  },

  // Finance & Crypto
  robinhood: {
    sender: /@robinhood\.com$/i,
    subject: /(free stock|invite|referral|join robinhood)/i,
    code: {
      inUrl: /join\.robinhood\.com\/([a-zA-Z0-9_-]+)/i,
      inBody: /(?:code)\s*[:\-]?\s*([a-zA-Z0-9]+)/i,
    },
    urlPatterns: [/https?:\/\/[^\s]*join\.robinhood\.com\/[^\s]*/i],
    reward: /(free stock|\$?\d+.*stock)/i,
    serviceName: "Robinhood",
    category: "finance",
    priority: 95,
  },

  trading212: {
    sender: /@trading212\.com$/i,
    subject: /(free share|invite|referral|join)/i,
    code: {
      inUrl: /trading212\.com\/invite\/([a-zA-Z0-9_-]+)/i,
      inBody: /(?:code|invite)\s*[:\-]?\s*([A-Z0-9]+)/i,
    },
    urlPatterns: [/https?:\/\/[^\s]*trading212\.com\/invite\/[^\s]*/i],
    reward: /(free share|\$?\d+.*share)/i,
    expiry: /(?:expires?|valid\s*until)\s*[:\-]?\s*(.+)/i,
    serviceName: "Trading 212",
    category: "finance",
    priority: 95,
  },

  crypto_com: {
    sender: /@crypto\.com$/i,
    subject: /(invite|referral|bonus|reward)/i,
    code: {
      inUrl: /crypto\.com\/app\/([a-zA-Z0-9_-]+)/i,
      inBody: /(?:code|referral)\s*[:\-]?\s*([A-Z0-9]+)/i,
    },
    urlPatterns: [
      /https?:\/\/[^\s]*crypto\.com\/app\/[^\s]*/i,
      /https?:\/\/[^\s]*crypto\.com\/exchange\/[^\s]*/i,
    ],
    reward: /(\$?\d+\s*(?:bonus|crypto|usd|\$))/i,
    expiry: /(?:expires?|valid\s*until)\s*[:\-]?\s*(.+)/i,
    serviceName: "Crypto.com",
    category: "finance",
    priority: 95,
  },

  coinbase: {
    sender: /@coinbase\.com$/i,
    subject: /(invite|referral|earn|bonus)/i,
    code: {
      inUrl: /coinbase\.com\/join\/([a-zA-Z0-9_-]+)/i,
      inBody: /(?:code|invite)\s*[:\-]?\s*([A-Z0-9]+)/i,
    },
    urlPatterns: [/https?:\/\/[^\s]*coinbase\.com\/join\/[^\s]*/i],
    reward: /(\$?\d+\s*(?:bonus|crypto|btc|eth))/i,
    expiry: /(?:expires?|valid\s*until)\s*[:\-]?\s*(.+)/i,
    serviceName: "Coinbase",
    category: "finance",
    priority: 95,
  },

  revolut: {
    sender: /@revolut\.com$/i,
    subject: /(invite|reward|bonus|referral)/i,
    code: {
      inUrl: /revolut\.com\/referral\/([a-zA-Z0-9_-]+)/i,
      inBody: /(?:code|invite)\s*[:\-]?\s*([A-Z0-9]+)/i,
    },
    urlPatterns: [/https?:\/\/[^\s]*revolut\.com\/referral\/[^\s]*/i],
    reward: /(\$?\d+\s*(?:bonus|reward|cash))/i,
    expiry: /(?:expires?|valid\s*until)\s*[:\-]?\s*(.+)/i,
    serviceName: "Revolut",
    category: "finance",
    priority: 90,
  },

  // Shopping & Cashback
  rakuten: {
    sender: /@rakuten\.com$/i,
    subject: /(cash back|invite|referral|bonus)/i,
    code: {
      inUrl: /rakuten\.com\/r\/([a-zA-Z0-9_-]+)/i,
      inBody: /(?:code|invite)\s*[:\-]?\s*([A-Z0-9]+)/i,
    },
    urlPatterns: [
      /https?:\/\/[^\s]*rakuten\.com\/r\/[^\s]*/i,
      /https?:\/\/[^\s]*rakuten\.com\/referral\/[^\s]*/i,
    ],
    reward: /(\$?\d+\s*(?:bonus|cash back|reward))/i,
    expiry: /(?:expires?|valid\s*until)\s*[:\-]?\s*(.+)/i,
    serviceName: "Rakuten",
    category: "shopping",
    priority: 95,
  },

  honey: {
    sender: /@joinhoney\.com$/i,
    subject: /(gold|invite|referral|reward)/i,
    code: {
      inUrl: /joinhoney\.com\/referral\/([a-zA-Z0-9_-]+)/i,
      inBody: /(?:code|invite)\s*[:\-]?\s*([A-Z0-9]+)/i,
    },
    urlPatterns: [/https?:\/\/[^\s]*joinhoney\.com\/referral\/[^\s]*/i],
    reward: /(\$?\d+\s*(?:gold|gift card|reward))/i,
    expiry: /(?:expires?|valid\s*until)\s*[:\-]?\s*(.+)/i,
    serviceName: "Honey",
    category: "shopping",
    priority: 85,
  },

  ibotta: {
    sender: /@ibotta\.com$/i,
    subject: /(bonus|invite|referral|reward)/i,
    code: {
      inUrl: /ibotta\.com\/referral\/([a-zA-Z0-9_-]+)/i,
      inBody: /(?:code|invite)\s*[:\-]?\s*([A-Z0-9]+)/i,
    },
    urlPatterns: [/https?:\/\/[^\s]*ibotta\.com\/referral\/[^\s]*/i],
    reward: /(\$?\d+\s*(?:bonus|reward))/i,
    expiry: /(?:expires?|valid\s*until)\s*[:\-]?\s*(.+)/i,
    serviceName: "Ibotta",
    category: "shopping",
    priority: 80,
  },

  // Cloud Storage & Software
  dropbox: {
    sender: /@dropbox\.com$/i,
    subject:
      /(invited you to join|get extra space|referral bonus|invite friends)/i,
    code: {
      inUrl: /db\.tt\/([a-zA-Z0-9]+)/i,
      inBody: /(?:invite\s*code|referral\s*code)\s*[:\-]?\s*([a-zA-Z0-9]+)/i,
    },
    urlPatterns: [
      /https?:\/\/[^\s]*db\.tt\/[^\s]*/i,
      /https?:\/\/[^\s]*dropbox\.com\/referral\/[^\s]*/i,
    ],
    reward: /(\d+(?:\.\d+)?\s*(?:GB|MB|space))/i,
    expiry: /(?:expires?|valid\s*until)\s*[:\-]?\s*(.+)/i,
    serviceName: "Dropbox",
    category: "cloud_storage",
    priority: 95,
  },

  google_one: {
    sender: /@google\.com$/i,
    subject: /(google one|storage plan|share storage)/i,
    code: {
      inUrl: /one\.google\.com\/share\/([a-zA-Z0-9_-]+)/i,
      inBody: /(?:code|promo)\s*[:\-]?\s*([A-Z0-9]+)/i,
    },
    urlPatterns: [/https?:\/\/[^\s]*one\.google\.com\/share\/[^\s]*/i],
    reward: /(\d+\s*(?:GB|TB|storage))/i,
    expiry: /(?:until|before|by)\s+(.+)/i,
    serviceName: "Google One",
    category: "cloud_storage",
    priority: 90,
  },

  pcloud: {
    sender: /@pcloud\.com$/i,
    subject: /(invite|storage|bonus|space)/i,
    code: {
      inUrl: /pcloud\.com\/invite\/([a-zA-Z0-9_-]+)/i,
      inBody: /(?:code|invite)\s*[:\-]?\s*([A-Z0-9]+)/i,
    },
    urlPatterns: [/https?:\/\/[^\s]*pcloud\.com\/invite\/[^\s]*/i],
    reward: /(\d+\s*(?:GB|TB|storage|space))/i,
    expiry: /(?:expires?|valid\s*until)\s*[:\-]?\s*(.+)/i,
    serviceName: "pCloud",
    category: "cloud_storage",
    priority: 85,
  },

  // Communication & Social
  discord: {
    sender: /@discord\.com$/i,
    subject: /(nitro|invite|boost|referral)/i,
    code: {
      inUrl: /discord\.gg\/([a-zA-Z0-9_-]+)/i,
      inBody: /(?:code|invite)\s*[:\-]?\s*([A-Z0-9]+)/i,
    },
    urlPatterns: [
      /https?:\/\/[^\s]*discord\.gg\/[^\s]*/i,
      /https?:\/\/[^\s]*discord\.com\/invite\/[^\s]*/i,
    ],
    reward: /(nitro|boost|premium)/i,
    expiry: /(?:expires?|valid\s*until)\s*[:\-]?\s*(.+)/i,
    serviceName: "Discord",
    category: "communication",
    priority: 85,
  },

  telegram: {
    sender: /@telegram\.org$/i,
    subject: /(premium|invite|referral)/i,
    code: {
      inUrl: /t\.me\/([a-zA-Z0-9_-]+)/i,
      inBody: /(?:code|invite)\s*[:\-]?\s*([A-Z0-9]+)/i,
    },
    urlPatterns: [/https?:\/\/[^\s]*t\.me\/[^\s]*/i],
    reward: /(premium|subscription)/i,
    expiry: /(?:expires?|valid\s*until)\s*[:\-]?\s*(.+)/i,
    serviceName: "Telegram",
    category: "communication",
    priority: 80,
  },

  // Streaming & Entertainment
  spotify: {
    sender: /@spotify\.com$/i,
    subject: /(premium|family|invite|referral)/i,
    code: {
      inUrl: /spotify\.com\/invite\/([a-zA-Z0-9_-]+)/i,
      inBody: /(?:code|invite)\s*[:\-]?\s*([A-Z0-9]+)/i,
    },
    urlPatterns: [/https?:\/\/[^\s]*spotify\.com\/invite\/[^\s]*/i],
    reward: /(premium|family|month|free)/i,
    expiry: /(?:expires?|valid\s*until)\s*[:\-]?\s*(.+)/i,
    serviceName: "Spotify",
    category: "entertainment",
    priority: 90,
  },

  netflix: {
    sender: /@netflix\.com$/i,
    subject: /(extra member|invite|share|referral)/i,
    code: {
      inUrl: /netflix\.com\/referral\/([a-zA-Z0-9_-]+)/i,
      inBody: /(?:code|invite)\s*[:\-]?\s*([A-Z0-9]+)/i,
    },
    urlPatterns: [/https?:\/\/[^\s]*netflix\.com\/referral\/[^\s]*/i],
    reward: /(extra\s*member|screen)/i,
    expiry: /(?:expires?|valid\s*until)\s*[:\-]?\s*(.+)/i,
    serviceName: "Netflix",
    category: "entertainment",
    priority: 85,
  },

  // Health & Fitness
  headspace: {
    sender: /@headspace\.com$/i,
    subject: /(invite|referral|free|meditation)/i,
    code: {
      inUrl: /headspace\.com\/referral\/([a-zA-Z0-9_-]+)/i,
      inBody: /(?:code|invite)\s*[:\-]?\s*([A-Z0-9]+)/i,
    },
    urlPatterns: [/https?:\/\/[^\s]*headspace\.com\/referral\/[^\s]*/i],
    reward: /(free|month|access)/i,
    expiry: /(?:expires?|valid\s*until)\s*[:\-]?\s*(.+)/i,
    serviceName: "Headspace",
    category: "health",
    priority: 80,
  },

  calibrate: {
    sender: /@calibrate\.com$/i,
    subject: /(invite|referral|program)/i,
    code: {
      inUrl: /calibrate\.com\/referral\/([a-zA-Z0-9_-]+)/i,
      inBody: /(?:code|invite)\s*[:\-]?\s*([A-Z0-9]+)/i,
    },
    urlPatterns: [/https?:\/\/[^\s]*calibrate\.com\/referral\/[^\s]*/i],
    reward: /(discount|credit)/i,
    expiry: /(?:expires?|valid\s*until)\s*[:\-]?\s*(.+)/i,
    serviceName: "Calibrate",
    category: "health",
    priority: 75,
  },
};
