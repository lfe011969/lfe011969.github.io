// netlify/functions/beers.js
import * as cheerio from "cheerio";

const URL = "https://billsburg.com/beers-on-tap/";

export async function handler() {
  try {
    const res = await fetch(URL, {
      headers: {
        // Friendly UA helps some hosts return full HTML
        "user-agent": "Mozilla/5.0 (BeerListBot; +https://example.com)"
      }
    });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    // Try a few selectors common on WP/Elementor pages
    const selectors = [
      "main h2, main h3, main .h2, main .h3",
      ".elementor-widget-heading .elementor-heading-title",
      ".et_pb_text_inner h2, .et_pb_text_inner h3",
      ".card h3, .card .title, .beer, .beer-title, .beer__title"
    ];

    let items = [];
    for (const sel of selectors) {
      $(sel).each((_, el) => {
        const t = $(el).text().trim();
        if (t) items.push(t);
      });
    }

    // Fallback: scan visible text for "title-like" lines
    if (items.length === 0) {
      const bodyText = $("body").text() || "";
      const lines = bodyText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const banned = /privacy|contact|calendar|directions|instagram|facebook|book an event|waterfront grill|brewery & taproom/i;
      const looksTitley = s =>
        s.length >= 3 &&
        s.length <= 60 &&
        /[A-Za-z]/.test(s) &&
        !banned.test(s) &&
        !(s === s.toUpperCase() && s.replace(/[^A-Z]/g, "").length > 6) &&
        !/[?|!.,:;$]/.test(s);
      items = lines.filter(looksTitley);
    }

    // Cleanup: de-dupe and drop obvious non-beer lines / metadata
    const beers = Array.from(new Set(items))
      .map(s => s.replace(/\s+/g, " ").trim())
      .filter(s => !/(ABV|IBU|%|pint|oz|growler|howler|taster|flight)/i.test(s))
      .filter(s => !/^(Beers On Tap|Brewery & Taproom|Rides|Directions|Let’s Be Social)$/i.test(s));

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*"   // handy during dev; same-origin on Netlify is fine
      },
      body: JSON.stringify({ brewery: "Billsburg Brewery", beers })
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to scrape Billsburg." })
    };
  }
}
