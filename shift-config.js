const SHIFT_CONFIG = {
  platforms: [
    { id: "steam", label: "Steam" },
    { id: "psn", label: "PlayStation" },
    { id: "xbox", label: "Xbox Live" },
    { id: "nintendo", label: "Nintendo" },
    { id: "epic", label: "Epic Games" },
    { id: "stadia", label: "Stadia" }
  ],
  games: [
    {
      id: "borderlands4",
      label: "Borderlands 4",
      defaultUrls: [
        "https://www.polygon.com/borderlands-4-active-shift-codes-redeem/",
        "https://mentalmars.com/game-news/borderlands-4-shift-codes/"
      ]
    },
    {
      id: "tinytina",
      label: "Tiny Tina's Wonderlands",
      defaultUrls: [
        "https://mentalmars.com/game-news/tiny-tinas-wonderlands-shift-codes/",
        "https://www.rockpapershotgun.com/tiny-tinas-wonderlands-shift-codes"
      ]
    },
    {
      id: "borderlands3",
      label: "Borderlands 3",
      defaultUrls: [
        "https://mentalmars.com/game-news/borderlands-3-golden-keys/"
      ]
    },
    {
      id: "borderlandspresequel",
      label: "Borderlands: The Pre-Sequel",
      defaultUrls: [
        "https://mentalmars.com/game-news/bltps-golden-keys/"
      ]
    },
    {
      id: "borderlands2",
      label: "Borderlands 2",
      defaultUrls: [
        "https://mentalmars.com/game-news/borderlands-2-golden-keys/"
      ]
    },
    {
      id: "borderlandsgameoftheyear",
      label: "Borderlands: Game of the Year Edition",
      defaultUrls: [
        "https://mentalmars.com/game-news/borderlands-golden-keys/"
      ]
    }
  ]
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = SHIFT_CONFIG;
}

if (typeof globalThis !== "undefined") {
  globalThis.SHIFT_CONFIG = SHIFT_CONFIG;
}
