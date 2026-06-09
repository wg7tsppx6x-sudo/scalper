#!/usr/bin/env python3
"""
Pokemon Card Deal Finder
Scrapes eBay for cards selling at or below 70% of market price.
Market prices sourced from Pokemon TCG API (pokemontcg.io) + TCGPlayer.
"""

import os
import time
import statistics

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich import box

from config import SEARCH_CARDS, DEAL_THRESHOLD
from scrapers.pokemontcg import get_market_price as pokemontcg_price
from scrapers.tcgplayer import get_market_price, get_market_price_html_fallback
from scrapers.ebay import get_ebay_listings, get_ebay_sold_prices

console = Console()


def resolve_market_price(card_name: str) -> tuple[float | None, str]:
    """
    Returns (market_price, source_label).
    Priority: Pokemon TCG API → TCGPlayer API → TCGPlayer HTML → eBay sold median.
    """
    # 1. Pokemon TCG API (free, reliable from any IP)
    result = pokemontcg_price(card_name)
    if result and result["market_price"] > 0:
        label = f"PokemonTCG API / {result['set']}" if result["set"] else "PokemonTCG API"
        return result["market_price"], label

    # 2. TCGPlayer direct API
    result = get_market_price(card_name)
    if result and result["market_price"] > 0:
        label = f"TCGPlayer / {result['set']}" if result["set"] else "TCGPlayer"
        return result["market_price"], label

    # 3. TCGPlayer HTML
    result = get_market_price_html_fallback(card_name)
    if result and result["market_price"] > 0:
        return result["market_price"], "TCGPlayer HTML"

    # 4. eBay sold median (last resort)
    sold = get_ebay_sold_prices(card_name, limit=20)
    if len(sold) >= 5:
        median = statistics.median(sold)
        return median, f"eBay sold median (n={len(sold)})"

    return None, "unavailable"


def find_deals(card_name: str) -> list[dict]:
    console.print(f"[cyan]→ Checking:[/cyan] {card_name}")

    market_price, source = resolve_market_price(card_name)

    if market_price is None:
        console.print(f"  [yellow]⚠  Could not resolve market price — skipping[/yellow]")
        return []

    threshold = market_price * DEAL_THRESHOLD
    console.print(
        f"  [green]Market:[/green] ${market_price:.2f}  "
        f"[dim]({source})[/dim]  "
        f"[bold]Deal threshold:[/bold] ≤ ${threshold:.2f}"
    )

    listings = get_ebay_listings(card_name)
    if not listings:
        console.print("  [dim]No eBay listings found[/dim]")
        return []

    deals = [
        {
            "card": card_name,
            "market_price": market_price,
            "price_source": source,
            "listing_price": l["price"],
            "pct_of_market": (l["price"] / market_price) * 100,
            "savings": market_price - l["price"],
            "title": l["title"],
            "condition": l["condition"],
            "url": l["url"],
        }
        for l in listings
        if l["price"] <= threshold
    ]

    deals.sort(key=lambda d: d["pct_of_market"])
    total = len(listings)
    console.print(
        f"  [bold {'green' if deals else 'dim'}]{len(deals)} deal(s)[/bold {'green' if deals else 'dim'}]"
        f" found out of {total} listing(s)"
    )
    return deals


def print_deals_table(all_deals: list[dict]) -> None:
    if not all_deals:
        console.print(Panel("[bold red]No deals found.[/bold red]", expand=False))
        return

    table = Table(
        title=f"Pokemon Card Deals  ≤ {int(DEAL_THRESHOLD * 100)}% of Market",
        box=box.ROUNDED,
        show_lines=True,
        highlight=True,
    )
    table.add_column("Card", style="bold cyan", no_wrap=True)
    table.add_column("Market $", justify="right", style="green")
    table.add_column("Listed $", justify="right", style="bold yellow")
    table.add_column("% Market", justify="right")
    table.add_column("Savings", justify="right", style="magenta")
    table.add_column("Condition", style="dim")
    table.add_column("Title / Link", overflow="fold")

    for d in sorted(all_deals, key=lambda x: x["pct_of_market"]):
        pct_color = "bold green" if d["pct_of_market"] <= 50 else "yellow"
        table.add_row(
            d["card"],
            f"${d['market_price']:.2f}",
            f"${d['listing_price']:.2f}",
            f"[{pct_color}]{d['pct_of_market']:.1f}%[/{pct_color}]",
            f"${d['savings']:.2f}",
            d["condition"],
            f"{d['title'][:55]}\n[dim blue]{d['url']}[/dim blue]",
        )

    console.print(table)
    console.print(f"\n[bold]Total deals found:[/bold] {len(all_deals)}")


def main() -> None:
    ebay_key = os.environ.get("EBAY_APP_ID")
    pokemontcg_key = os.environ.get("POKEMONTCG_API_KEY")

    console.print(Panel(
        "[bold white]Pokemon Card Deal Finder[/bold white]\n"
        f"[dim]Flagging eBay listings ≤ {int(DEAL_THRESHOLD * 100)}% of market price[/dim]\n"
        f"[dim]eBay API key: {'✓' if ebay_key else '✗ (HTML fallback)'}  "
        f"PokemonTCG API key: {'✓' if pokemontcg_key else '○ (free tier)'}[/dim]",
        expand=False,
    ))

    all_deals: list[dict] = []
    for i, card in enumerate(SEARCH_CARDS):
        deals = find_deals(card)
        all_deals.extend(deals)
        if i < len(SEARCH_CARDS) - 1:
            time.sleep(1.0)

    console.print()
    print_deals_table(all_deals)


if __name__ == "__main__":
    main()
