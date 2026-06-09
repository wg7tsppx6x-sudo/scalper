"""
TCGPlayer market price scraper.
Uses TCGPlayer's public search API endpoint.
"""

import re
import requests
from bs4 import BeautifulSoup
from config import HEADERS


TCGPLAYER_PRICE_API = "https://mp-search-api.tcgplayer.com/v1/search/request"
TCGPLAYER_SEARCH_URL = "https://www.tcgplayer.com/search/pokemon/product"

_SESSION = None


def _get_session() -> requests.Session:
    global _SESSION
    if _SESSION is not None:
        return _SESSION

    s = requests.Session()
    s.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "DNT": "1",
        "Referer": "https://www.tcgplayer.com/",
    })
    # Warm up a session cookie by visiting the homepage
    try:
        s.get("https://www.tcgplayer.com/", timeout=10)
    except Exception:
        pass

    _SESSION = s
    return _SESSION


def _build_search_payload(card_name: str) -> dict:
    return {
        "algorithm": "sales_dismax",
        "from": 0,
        "size": 10,
        "filters": {
            "term": {
                "productLineName": ["pokemon"],
                "sellerStatus": "Live",
                "channel": "site",
                "language": ["English"],
            },
            "range": {},
            "match": {},
        },
        "listingSearch": {
            "filters": {
                "term": {"sellerStatus": "Live", "channel": "site"},
                "range": {"quantity": {"gte": 1}},
                "exclude": {"channelExclusion": 0},
            }
        },
        "context": {"cart": {}},
        "settings": {"useFuzzySearch": True, "didYouMean": {}},
        "sort": {},
        "query": card_name,
        "aggregations": ["productType"],
    }


def get_market_price(card_name: str) -> dict | None:
    """
    Returns market price info for a card from TCGPlayer.
    Returns dict with keys: name, market_price, url, set  or None on failure.
    """
    session = _get_session()
    try:
        payload = _build_search_payload(card_name)
        resp = session.post(
            TCGPLAYER_PRICE_API,
            json=payload,
            headers={
                "Content-Type": "application/json",
                "Origin": "https://www.tcgplayer.com",
                "Referer": "https://www.tcgplayer.com/search/pokemon/product",
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()

        hits = (
            data.get("results", [{}])[0]
            .get("hits", [])
        )

        for hit in hits:
            src = hit.get("_source", {})
            market_price = src.get("marketPrice") or src.get("lowestPrice")
            if market_price and float(market_price) > 0:
                return {
                    "name": src.get("productName", card_name),
                    "market_price": float(market_price),
                    "url": f"https://www.tcgplayer.com/product/{src.get('productId', '')}",
                    "set": src.get("setName", ""),
                }

        return None

    except Exception as exc:
        print(f"[TCGPlayer API] Error for '{card_name}': {exc}")
        return None


def get_market_price_html_fallback(card_name: str) -> dict | None:
    """
    Fallback: scrape TCGPlayer search page for market price.
    """
    session = _get_session()
    try:
        params = {
            "q": card_name,
            "view": "grid",
            "Language": "English",
        }
        resp = session.get(
            TCGPLAYER_SEARCH_URL,
            params=params,
            timeout=15,
        )
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")

        for card in soup.select(".search-result__content"):
            name_el = card.select_one(".search-result__title")
            price_el = (
                card.select_one(".inventory__price-with-shipping")
                or card.select_one(".search-result__market-price--value")
            )
            if name_el and price_el:
                price_text = price_el.get_text(strip=True).replace(",", "")
                m = re.search(r"[\d]+\.[\d]{2}", price_text)
                if m:
                    return {
                        "name": name_el.get_text(strip=True),
                        "market_price": float(m.group()),
                        "url": (
                            "https://www.tcgplayer.com"
                            + (card.select_one("a")["href"] if card.select_one("a") else "")
                        ),
                        "set": "",
                    }

        return None

    except Exception as exc:
        print(f"[TCGPlayer HTML] Error for '{card_name}': {exc}")
        return None
