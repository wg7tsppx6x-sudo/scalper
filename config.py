DEAL_THRESHOLD = 0.70  # flag listings at or below 70% of market price

# Cards to search for — edit this list freely
# Format: "Card Name" or "Card Name set:SET_NAME"
SEARCH_CARDS = [
    "Charizard ex",
    "Pikachu VMAX",
    "Umbreon VMAX",
    "Rayquaza VMAX",
    "Lugia V",
    "Mewtwo V",
    "Gengar VMAX",
    "Blastoise ex",
    "Venusaur ex",
]

# eBay search config
EBAY_MAX_RESULTS = 50  # listings to fetch per card
EBAY_CONDITION_FILTER = True  # skip "for parts / not working" listings

# Request headers to mimic a real browser
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}
