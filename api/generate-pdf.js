const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");
const { utapi } = require("@uploadthing/react"); // UploadThing for storage

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
            args: [
                ...chromium.args,
                "--disable-gpu",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-accelerated-2d-canvas",
                "--disable-extensions"
            ]
        });

        const page = await browser.newPage();

        // **Speed optimization: Block unnecessary assets**
        await page.setRequestInterception(true);
        page.on("request", (req) => {
            if (["image", "stylesheet", "font"].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });

        if (excludeSelectors && Array.isArray(excludeSelectors)) {
            await page.evaluate((selectors) => {
                selectors.forEach(selector => {
                    document.querySelectorAll(selector).forEach(el => el.style.display = "none");
                });
            }, excludeSelectors);
        }

        // **Generate PDF**
        const pdfBuffer = await page.pdf({
            format: "A4",
            printBackground: true,
            timeout: 10000,
            margin: { top: "10px", bottom: "10px", left: "10px", right: "10px" }
        });

        await browser.close();

        // **Upload PDF to UploadThing**
        const uploadResponse = await utapi.upload({
            name: `export-${Date.now()}.pdf`,
            file: pdfBuffer
        });

        if (!uploadResponse.url) {
            throw new Error("Upload failed");
        }

        res.json({ pdfUrl: uploadResponse.url });
    } catch (error) {
        console.error("Error generating PDF:", error);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
};