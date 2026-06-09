"""
eBay listing scraper for Pokemon cards.

Two modes:
  1. eBay Finding API  — recommended, free key at https://developer.ebay.com
                         set EBAY_APP_ID in .env
  2. HTML scrape       — fallback, may be blocked on cloud IPs
"""

import os
import re
import requests
from bs4 import BeautifulSoup
from config import EBAY_MAX_RESULTS


EBAY_FINDING_API = "https://svcs.ebay.com/services/search/FindingService/v1"
EBAY_SEARCH_URL = "https://www.ebay.com/sch/i.html"

JUNK_KEYWORDS = [
    "lot", "bundle", "collection", "bulk", "booster box", "sealed box",
    "booster pack", " packs", "tin", "binder", "sleeve", "case",
]

_SESSION = requests.Session()
_SESSION.headers.update({
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
})


def _is_junk(title: str) -> bool:
    t = title.lower()
    return any(kw in t for kw in JUNK_KEYWORDS)


def _parse_price(text: str) -> float | None:
    text = text.replace(",", "")
    m = re.search(r"\$?([\d]+\.[\d]{2})", text)
    return float(m.group(1)) if m else None


# ── eBay Finding API ──────────────────────────────────────────────────────────

def _get_app_id() -> str | None:
    return os.environ.get("EBAY_APP_ID")


def get_ebay_listings_api(card_name: str) -> list[dict]:
    app_id = _get_app_id()
    if not app_id:
        return []

    params = {
        "OPERATION-NAME": "findItemsAdvanced",
        "SERVICE-VERSION": "1.0.0",
        "SECURITY-APPNAME": app_id,
        "RESPONSE-DATA-FORMAT": "JSON",
        "REST-PAYLOAD": "",
        "keywords": f"{card_name} pokemon card",
        "categoryId": "2536",
        "itemFilter(0).name": "ListingType",
        "itemFilter(0).value": "FixedPrice",
        "sortOrder": "PricePlusShippingLowest",
        "paginationInput.entriesPerPage": str(min(EBAY_MAX_RESULTS, 100)),
    }

    listings = []
    try:
        resp = _SESSION.get(EBAY_FINDING_API, params=params, timeout=12)
        resp.raise_for_status()
        data = resp.json()

        items = (
            data.get("findItemsAdvancedResponse", [{}])[0]
            .get("searchResult", [{}])[0]
            .get("item", [])
        )

        for item in items:
            title = item.get("title", [""])[0]
            if _is_junk(title):
                continue

            price_info = (
                item.get("sellingStatus", [{}])[0]
                .get("currentPrice", [{}])[0]
            )
            price = float(price_info.get("__value__", 0))
            if price <= 0:
                continue

            url = item.get("viewItemURL", [""])[0]
            condition = (
                item.get("condition", [{}])[0]
                .get("conditionDisplayName", ["Unknown"])[0]
            )
            listings.append({
                "title": title,
                "price": price,
                "url": url,
                "condition": condition,
            })

    except Exception as exc:
        print(f"[eBay API] Error for '{card_name}': {exc}")

    return listings


# ── HTML scrape fallback ──────────────────────────────────────────────────────

def get_ebay_listings_html(card_name: str) -> list[dict]:
    params = {
        "_nkw": f"{card_name} pokemon card",
        "LH_BIN": "1",
        "_sop": "15",
        "_ipg": str(min(EBAY_MAX_RESULTS, 240)),
    }
    listings = []
    try:
        resp = _SESSION.get(EBAY_SEARCH_URL, params=params, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")

        for item in soup.select("li.s-item"):
            title_el = item.select_one(".s-item__title")
            price_el = item.select_one(".s-item__price")
            link_el = item.select_one("a.s-item__link")
            cond_el = item.select_one(".SECONDARY_INFO")

            if not (title_el and price_el and link_el):
                continue
            title = title_el.get_text(strip=True)
            if "Shop on eBay" in title or _is_junk(title):
                continue
            price = _parse_price(price_el.get_text())
            if not price:
                continue
            listings.append({
                "title": title,
                "price": price,
                "url": link_el["href"].split("?")[0],
                "condition": cond_el.get_text(strip=True) if cond_el else "Unknown",
            })
    except Exception as exc:
        print(f"[eBay HTML] Error for '{card_name}': {exc}")

    return listings


def get_ebay_sold_prices(card_name: str, limit: int = 20) -> list[float]:
    """Recent sold prices from eBay completed listings."""
    params = {
        "_nkw": f"{card_name} pokemon card",
        "LH_Complete": "1",
        "LH_Sold": "1",
        "LH_BIN": "1",
        "_sop": "13",
        "_ipg": str(limit),
    }
    prices = []
    try:
        resp = _SESSION.get(EBAY_SEARCH_URL, params=params, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")
        for item in soup.select("li.s-item"):
            title_el = item.select_one(".s-item__title")
            price_el = item.select_one(".s-item__price")
            if not (title_el and price_el):
                continue
            if _is_junk(title_el.get_text()):
                continue
            p = _parse_price(price_el.get_text())
            if p:
                prices.append(p)
    except Exception as exc:
        print(f"[eBay Sold] Error for '{card_name}': {exc}")
    return prices


def get_ebay_listings(card_name: str) -> list[dict]:
    """Primary entry point — tries API first, then HTML fallback."""
    results = get_ebay_listings_api(card_name)
    if results:
        return results
    return get_ebay_listings_html(card_name)
