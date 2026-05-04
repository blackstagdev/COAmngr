import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Try to authenticate public storefront app proxy if possible, or use admin auth if called from admin.
  // Actually, App Proxies use signature verification which shopify.server handles via authenticate.public.appProxy.
  
  let adminAuth;
  try {
    const { admin } = await authenticate.public.appProxy(request);
    adminAuth = admin;
  } catch (e) {
    // Fallback if testing directly without proxy
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q") || "";
  
  // The search should ideally look through products and their metafields.
  // Shopify GraphQL doesn't allow searching directly by Metafield value for JSON fields easily unless using Storefront API.
  // For simplicity in this demo, we'll fetch first 100 products and filter in memory, or search by title.
  // In a real production app, you might sync this data to your database for fast searching.

  // Using secret admin filters
  let graphqlQuery = `title:*${query}*`;
  const isSecretFilter = query.startsWith("!");
  
  if (!isSecretFilter) {
    graphqlQuery = `title:*${query}*`; // Basic search by title
  } else {
    graphqlQuery = `status:ACTIVE`; // Fetch active products to filter in memory
  }

  const response = await adminAuth.graphql(
    `#graphql
    query searchProducts($query: String!) {
      products(first: 50, query: $query) {
        edges {
          node {
            id
            title
            requireRequest: metafield(namespace: "coa", key: "require_request") {
              value
            }
            coaRecords: metafield(namespace: "coa", key: "records") {
              value
            }
          }
        }
      }
    }`,
    { variables: { query: graphqlQuery } }
  );

  const responseJson = await response.json();
  const products = responseJson.data.products.edges.map((e: any) => e.node);

  let results: any[] = [];

  products.forEach((product: any) => {
    if (product.coaRecords && product.coaRecords.value) {
      const records = JSON.parse(product.coaRecords.value);
      const requireRequest = product.requireRequest?.value === "true";

      records.forEach((record: any) => {
        // Apply search filter on Lot Number if it wasn't a title match
        if (!isSecretFilter) {
          const lotMatch = record.lot_number?.toLowerCase().includes(query.toLowerCase());
          const titleMatch = product.title.toLowerCase().includes(query.toLowerCase());
          
          if (lotMatch || titleMatch) {
            results.push({
              productId: product.id,
              productTitle: product.title,
              lotNumber: record.lot_number || "N/A",
              date: record.analysis_date || "N/A",
              labName: record.lab_name || "N/A",
              imageUrl: record.imageUrl,
              requireRequest
            });
          }
        } else {
          // Admin filters
          if (query === "!albert" && !record.lot_number) {
            results.push({
              productId: product.id,
              productTitle: product.title,
              lotNumber: "MISSING",
              date: record.analysis_date || "N/A",
              labName: record.lab_name || "N/A",
              imageUrl: record.imageUrl,
              requireRequest
            });
          } else if (query === "!mariel" && !record.analysis_date) {
            results.push({
              productId: product.id,
              productTitle: product.title,
              lotNumber: record.lot_number || "N/A",
              date: "MISSING",
              labName: record.lab_name || "N/A",
              imageUrl: record.imageUrl,
              requireRequest
            });
          }
        }
      });
    }
  });

  // Sort newest first
  results.sort((a, b) => {
    if (a.date === "N/A" || a.date === "MISSING") return 1;
    if (b.date === "N/A" || b.date === "MISSING") return -1;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return json({ results }, {
    headers: {
      "Access-Control-Allow-Origin": "*",
    }
  });
};
