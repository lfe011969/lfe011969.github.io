import express from "express";
import cors from "cors";
import morgan from "morgan";
import NodeCache from "node-cache";
import puppeteer from "puppeteer";

const app = express();
app.use(cors());
app.use(morgan("dev"));
app.use(express.static("public"));

const cache = new NodeCache({ stdTTL: 5 * 60 }); // cache 5 minutes

async function scrapeBillsburg() {
  const url = "https://billsburg.com/beers-on-tap/";
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage"
    ]
  });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60_000 });

    const selectors = [
      "main h2, main h3, main .h2, main .h3",
      ".elementor-widget-heading .elementor-heading-title",
      ".et_pb_text_inner h2, .et_pb_text_inner h3",
      ".card h3, .card .title, .beer, .beer-title, .beer__title"
    ];

    let items = [];
    for (const sel of selectors) {
      const got = await page.$$eval(sel, nodes =>
        nodes.map(n => n.textContent.trim()).filter(Boolean)
      );
      items = items.concat(got);
    }

    if (items.length === 0) {
      const bigText = await page.evaluate(() => document.body.innerText || "");
      const lines = bigText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
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

    const cleaned = Array.from(new Set(items))
      .map(s => s.replace(/\s+/g, " ").trim())
      .filter(s => !/(ABV|IBU|%|pint|oz|growler|howler|taster|flight)/i.test(s))
      .filter(s => !/^(Beers On Tap|Brewery & Taproom|Rides|Directions|Let’s Be Social)$/i.test(s));

    return cleaned;
  } finally {
    await browser.close();
  }
}

// simple health check
app.get("/healthz", (_, res) => res.send("ok"));

app.get("/api/beers", async (req, res) => {
  const cached = cache.get("billsburg");
  if (cached) return res.json({ brewery: "Billsburg Brewery", beers: cached });
  try {
    const beers = await scrapeBillsburg();
    cache.set("billsburg", beers);
    res.json({ brewery: "Billsburg Brewery", beers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to scrape Billsburg." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server at http://localhost:${PORT}`);
});
