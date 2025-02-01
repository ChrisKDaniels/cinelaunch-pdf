import "dotenv/config"; // Load .env variables
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { UTApi } from "@uploadthing/server";
import { execSync } from "child_process";

// Log installed dependencies inside Vercel
try {
  console.log("🔍 Checking Installed Dependencies...");
  const installedPackages = execSync("npm list --depth=0").toString();
  console.log(installedPackages);
} catch (error) {
  console.error("❌ Error Checking Installed Packages:", error.message);
}

// ✅ Correct way to initialize UploadThing API
const utapi = new UTApi();

// ✅ Debug: Log API Key Variables
console.log("🔹 UPLOADTHING_SECRET:", process.env.UPLOADTHING_SECRET ? "✅ Loaded" : "❌ MISSING");

if (!process.env.UPLOADTHING_SECRET) {
    throw new Error("❌ Missing UploadThing API key. Check your .env file!");
}

export default async function handler(req, res) {
    console.log("🔹 API Request Received");

    if (req.method !== "POST") {
        console.error("❌ Method Not Allowed");
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const { url, excludeSelectors } = req.body;
    console.log("🔹 URL to Process:", url);

    if (!url) {
        console.error("❌ No URL Provided");
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

        // **Upload PDF to UploadThing (Updated for SDK v7)**
        console.log("🔹 Uploading PDF to UploadThing...");
        const uploadResponse = await utapi.upload({
            file: pdfBuffer,
            fileName: `export-${Date.now()}.pdf`
        });

        if (!uploadResponse?.url) {
            console.error("❌ Upload Failed:", uploadResponse);
            throw new Error("Upload failed");
        }

        console.log("✅ Upload Successful:", uploadResponse.url);
        res.json({ pdfUrl: uploadResponse.url });
    } catch (error) {
        console.error("❌ Error generating PDF:", error);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
}