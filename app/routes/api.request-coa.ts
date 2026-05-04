import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import nodemailer from "nodemailer";

/**
 * API endpoint for requesting COA via email.
 * Called via App Proxy: POST /apps/coa-lookup/request-coa
 * 
 * Expects JSON body: { productId: string, email: string }
 * 
 * Fetches the product's COA data from metafields and emails it to the customer.
 */

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  // Authenticate via App Proxy
  let admin;
  try {
    const auth = await authenticate.public.appProxy(request);
    admin = auth.admin;
  } catch (e) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse the request body
  let body: { productId?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, { status: 400 });
  }

  const { productId, email } = body;

  if (!productId || !email) {
    return json({ error: "productId and email are required" }, { status: 400 });
  }

  // Fetch product data and COA metafields
  const productGid = productId.startsWith("gid://")
    ? productId
    : `gid://shopify/Product/${productId}`;

  const response = await admin.graphql(
    `#graphql
    query ProductCOA($id: ID!) {
      product(id: $id) {
        id
        title
        handle
        coaRecords: metafield(namespace: "coa", key: "records") {
          value
        }
      }
    }`,
    { variables: { id: productGid } }
  );

  const responseJson = await response.json();
  const product = responseJson.data?.product;

  if (!product) {
    return json({ error: "Product not found" }, { status: 404 });
  }

  if (!product.coaRecords?.value) {
    return json({ error: "No COA records found for this product" }, { status: 404 });
  }

  const records = JSON.parse(product.coaRecords.value);
  if (!records || records.length === 0) {
    return json({ error: "No COA records found for this product" }, { status: 404 });
  }

  // Find the latest COA (check is_latest flag first, then first record)
  let latestCoa = records.find((r: any) => r.is_latest === true) || records[0];

  // Build the email HTML
  const emailHtml = buildCoaEmailHtml(product.title, latestCoa, records);

  // Send the email
  try {
    await sendCoaEmail(email, product.title, emailHtml, latestCoa);
    return json({ success: true, message: "COA has been sent to your email." });
  } catch (e: any) {
    console.error("Failed to send COA email:", e);
    return json({ error: "Failed to send email. Please try again later." }, { status: 500 });
  }
};

function buildCoaEmailHtml(productTitle: string, latestCoa: any, allRecords: any[]): string {
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #1a1a2e; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 20px; }
        .content { border: 1px solid #e0e0e0; border-top: none; padding: 20px; border-radius: 0 0 8px 8px; }
        .coa-details { background: #f9f9f9; padding: 15px; border-radius: 6px; margin: 15px 0; }
        .coa-details p { margin: 5px 0; }
        .label { font-weight: bold; color: #555; }
        .coa-image { max-width: 100%; border: 1px solid #ddd; border-radius: 4px; margin-top: 15px; }
        .footer { margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee; font-size: 12px; color: #999; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Certificate of Analysis</h1>
      </div>
      <div class="content">
        <p>Here is the Certificate of Analysis you requested for <strong>${productTitle}</strong>.</p>
        
        <div class="coa-details">
          <h3 style="margin-top:0;">COA Details</h3>
          ${latestCoa.lot_number ? `<p><span class="label">Lot/Batch Number:</span> ${latestCoa.lot_number}</p>` : ''}
          ${latestCoa.analysis_date ? `<p><span class="label">Analysis Date:</span> ${latestCoa.analysis_date}</p>` : ''}
          ${latestCoa.lab_name ? `<p><span class="label">Lab:</span> ${latestCoa.lab_name}</p>` : ''}
          ${latestCoa.notes ? `<p><span class="label">Notes:</span> ${latestCoa.notes}</p>` : ''}
        </div>

        ${latestCoa.imageUrl ? `
          <h3>COA Document</h3>
          <img src="cid:coa-image" alt="Certificate of Analysis" class="coa-image" />
        ` : ''}

        <div class="footer">
          <p>This email was sent in response to your Certificate of Analysis request. If you did not request this, please disregard this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return html;
}

async function sendCoaEmail(to: string, productTitle: string, html: string, coa: any) {
  // SMTP configuration from environment variables
  const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
  const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
  const smtpUser = process.env.SMTP_USER || "";
  const smtpPass = process.env.SMTP_PASS || "";
  const fromEmail = process.env.SMTP_FROM || smtpUser;

  if (!smtpUser || !smtpPass) {
    throw new Error("SMTP credentials not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM environment variables.");
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  // Build attachments - if imageUrl is base64, embed it as inline attachment
  const attachments: any[] = [];
  if (coa.imageUrl) {
    if (coa.imageUrl.startsWith("data:")) {
      // Extract base64 content and mime type from data URL
      const matches = coa.imageUrl.match(/^data:(.+?);base64,(.+)$/);
      if (matches) {
        const contentType = matches[1];
        const base64Data = matches[2];
        const ext = contentType.split("/")[1] || "png";
        attachments.push({
          filename: `COA-${productTitle.replace(/[^a-zA-Z0-9]/g, '_')}.${ext}`,
          content: base64Data,
          encoding: "base64",
          contentType: contentType,
          cid: "coa-image",
        });
      }
    } else {
      // External URL - reference it directly
      attachments.push({
        filename: `COA-${productTitle.replace(/[^a-zA-Z0-9]/g, '_')}.png`,
        path: coa.imageUrl,
        cid: "coa-image",
      });
    }
  }

  await transporter.sendMail({
    from: `"COA Manager" <${fromEmail}>`,
    to: to,
    subject: `Certificate of Analysis: ${productTitle}`,
    html: html,
    attachments: attachments,
  });
}
