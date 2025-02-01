import "dotenv/config"; // Load .env variables
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { utapi } from "uploadthing/server";

// ✅ Ensure API Keys Exist
const UPLOADTHING_SECRET = process.env.UPLOADTHING_SECRET;
const UPLOADTHING_APP_ID = process.env.UPLOADTHING_APP_ID;

if (!UPLOADTHING_SECRET || !UPLOADTHING_APP_ID) {
    throw new Error("❌ Missing UploadThing API keys. Make sure they are set in the .env file!");
}

export default async function handler(req, res) {
    console.log("🔹 API Request Received");

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const { url, excludeSelectors } = req.body;
    console.log("🔹 URL to Process:", url);

    if (!url) {
        return res.status(400).json({ error: "URL is required" });
    }

    try {
        console.log("🔹 Launching Puppeteer...");
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

        console.log("🔹 Navigating to page:", url);
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });

        if (excludeSelectors && Array.isArray(excludeSelectors)) {
            console.log("🔹 Excluding elements:", excludeSelectors);
            await page.evaluate((selectors) => {
                selectors.forEach(selector => {
                    document.querySelectorAll(selector).forEach(el => el.style.display = "none");
                });
            }, excludeSelectors);
        }

        console.log("🔹 Generating PDF...");
        const pdfBuffer = await page.pdf({
            format: "A4",
            printBackground: true,
            timeout: 10000,
            margin: { top: "10px", bottom: "10px", left: "10px", right: "10px" }
        });

        await browser.close();
        console.log("✅ PDF Generated Successfully!");

        // **Upload PDF to UploadThing**
        console.log("🔹 Uploading PDF to UploadThing...");
        const uploadResponse = await utapi.uploadFiles({
            files: [{ name: `export-${Date.now()}.pdf`, buffer: pdfBuffer }]
        });

        if (!uploadResponse?.file?.url) {
            console.error("❌ Upload Failed:", uploadResponse);
            throw new Error("Upload failed");
        }

        console.log("✅ Upload Successful:", uploadResponse.file.url);
        res.json({ pdfUrl: uploadResponse.file.url });
    } catch (error) {
        console.error("❌ Error generating PDF:", error);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
}