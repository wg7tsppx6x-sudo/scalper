"""
Pokemon TCG API price source.
https://pokemontcg.io — free, no key required (rate limited).
API key optional (higher rate limit): set POKEMONTCG_API_KEY in .env

Card objects include TCGPlayer market prices under card.tcgplayer.prices.
"""

import os
import requests

POKEMONTCG_API = "https://api.pokemontcg.io/v2/cards"

_SESSION = requests.Session()
_SESSION.headers.update({"User-Agent": "PokemonCardDealFinder/1.0"})


def _get_headers() -> dict:
    api_key = os.environ.get("POKEMONTCG_API_KEY")
    if api_key:
        return {"X-Api-Key": api_key}
    return {}


def get_market_price(card_name: str) -> dict | None:
    """
    Returns market price info by querying the Pokemon TCG API.
    Returns dict: {name, market_price, url, set} or None.
    """
    try:
        # Search by name — try exact match first, then fuzzy
        for query in [f'name:"{card_name}"', f"name:{card_name.split()[0]}"]:
            params = {
                "q": query,
                "orderBy": "-set.releaseDate",
                "pageSize": 10,
                "select": "id,name,set,tcgplayer",
            }
            resp = _SESSION.get(
                POKEMONTCG_API,
                params=params,
                headers=_get_headers(),
                timeout=12,
            )
            resp.raise_for_status()
            cards = resp.json().get("data", [])

            for card in cards:
                tcg = card.get("tcgplayer", {})
                prices = tcg.get("prices", {})

                # Priority: holofoil > normal > reverseHolofoil > 1stEditionHolofoil
                for variant in ("holofoil", "normal", "reverseHolofoil", "1stEditionHolofoil"):
                    price_data = prices.get(variant, {})
                    market = price_data.get("market") or price_data.get("mid")
                    if market and float(market) > 0:
                        return {
                            "name": card.get("name", card_name),
                            "market_price": float(market),
                            "url": tcg.get("url", ""),
                            "set": card.get("set", {}).get("name", ""),
                        }

        return None

    except Exception as exc:
        print(f"[PokemonTCG API] Error for '{card_name}': {exc}")
        return None
