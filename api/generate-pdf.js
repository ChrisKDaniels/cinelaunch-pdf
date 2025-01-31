const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

module.exports = async (req, res) => {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const { url, excludeSelectors } = req.body;

    if (!url) {
        return res.status(400).json({ error: "URL is required" });
    }

    try {
        const browser = await puppeteer.launch({
            executablePath: await chromium.executablePath(),
            headless: true,
            args: chromium.args
        });

        const page = await browser.newPage();

        // **Speed optimization: Block images, fonts, and stylesheets**
        await page.setRequestInterception(true);
        page.on("request", (req) => {
            if (["image", "stylesheet", "font"].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.goto(url, { waitUntil: "domcontentloaded" });

        if (excludeSelectors && Array.isArray(excludeSelectors)) {
            await page.evaluate((selectors) => {
                selectors.forEach(selector => {
                    document.querySelectorAll(selector).forEach(el => el.style.display = "none");
                });
            }, excludeSelectors);
        }

        const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });

        await browser.close();

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "attachment; filename=export.pdf");
        res.send(pdfBuffer);
    } catch (error) {
        console.error("Error generating PDF:", error);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
};