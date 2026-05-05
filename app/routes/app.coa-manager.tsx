import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, useSearchParams } from "@remix-run/react";
import { useState, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Text,
  Badge,
  TextField,
  Select,
  Button,
  InlineStack,
  Box,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";
  const statusFilter = url.searchParams.get("status") || "";
  const cursor = url.searchParams.get("cursor") || null;
  const direction = url.searchParams.get("direction") || "next";

  let queryParts: string[] = [];
  if (search) queryParts.push(`title:*${search}*`);
  if (statusFilter) queryParts.push(`status:${statusFilter}`);
  const queryString = queryParts.join(" AND ");

  const isPrev = direction === "prev" && !!cursor;
  const variables: Record<string, any> = {
    query: queryString,
    first: isPrev ? null : 100,
    last: isPrev ? 100 : null,
    after: !isPrev && cursor ? cursor : null,
    before: isPrev ? cursor : null,
  };

  const response = await admin.graphql(
    `#graphql
    query getProducts($query: String, $first: Int, $last: Int, $after: String, $before: String) {
      products(first: $first, last: $last, query: $query, after: $after, before: $before) {
        edges {
          node {
            id
            title
            handle
            status
            metafield(namespace: "coa", key: "require_request") {
              value
            }
          }
          cursor
        }
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
        }
      }
    }`,
    { variables }
  );

  const responseJson = await response.json();
  const productsData = responseJson.data.products;

  return json({
    products: productsData.edges.map((edge: any) => edge.node),
    pageInfo: productsData.pageInfo,
    search,
    statusFilter,
  });
};

export default function CoaManager() {
  const { products, pageInfo, search, statusFilter } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchValue, setSearchValue] = useState(search);
  const [statusValue, setStatusValue] = useState(statusFilter);

  const handleFilter = useCallback(() => {
    const params = new URLSearchParams();
    if (searchValue) params.set("search", searchValue);
    if (statusValue) params.set("status", statusValue);
    navigate(`/app/coa-manager?${params.toString()}`);
  }, [searchValue, statusValue, navigate]);

  const handleClear = useCallback(() => {
    setSearchValue("");
    setStatusValue("");
    navigate("/app/coa-manager");
  }, [navigate]);

  const buildPageUrl = (direction: string, cursor: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("direction", direction);
    next.set("cursor", cursor);
    return `/app/coa-manager?${next.toString()}`;
  };

  const resourceName = { singular: "product", plural: "products" };

  const rowMarkup = products.map(({ id, title, status, metafield }: any, index: number) => {
    const productId = id.split("/").pop();
    const requireRequest = metafield?.value === "true";

    return (
      <IndexTable.Row
        id={id}
        key={id}
        position={index}
        onClick={() => navigate(`/app/products/${productId}`)}
      >
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="bold" as="span">{title}</Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {status === "ACTIVE" ? <Badge tone="success">Active</Badge> : <Badge>Draft</Badge>}
        </IndexTable.Cell>
        <IndexTable.Cell>
          {requireRequest
            ? <Badge tone="warning">Restricted (Request Only)</Badge>
            : <Badge tone="info">Public View</Badge>}
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Page title="COA Manager">
      <Layout>
        <Layout.Section>
          <Card>
            <InlineStack gap="300" align="start">
              <Box minWidth="300px">
                <TextField
                  label="Search"
                  value={searchValue}
                  onChange={setSearchValue}
                  placeholder="Search by product name..."
                  autoComplete="off"
                  labelHidden
                />
              </Box>
              <Select
                label="Status"
                options={[
                  { label: "All statuses", value: "" },
                  { label: "Active", value: "ACTIVE" },
                  { label: "Draft", value: "DRAFT" },
                ]}
                value={statusValue}
                onChange={setStatusValue}
                labelHidden
              />
              <Button onClick={handleFilter}>Filter</Button>
              <Button onClick={handleClear} variant="plain">Clear</Button>
            </InlineStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card padding="0">
            <IndexTable
              resourceName={resourceName}
              itemCount={products.length}
              headings={[
                { title: "Product" },
                { title: "Status" },
                { title: "COA Access" },
              ]}
              selectable={false}
              pagination={{
                hasNext: pageInfo.hasNextPage,
                hasPrevious: pageInfo.hasPreviousPage,
                onNext: () => navigate(buildPageUrl("next", pageInfo.endCursor)),
                onPrevious: () => navigate(buildPageUrl("prev", pageInfo.startCursor)),
              }}
            >
              {rowMarkup}
            </IndexTable>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
