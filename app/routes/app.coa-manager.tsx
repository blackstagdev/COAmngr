import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Text,
  Badge,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
    query {
      products(first: 50) {
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
        }
      }
    }`
  );

  const responseJson = await response.json();
  return json({
    products: responseJson.data.products.edges.map((edge: any) => edge.node),
  });
};

export default function CoaManager() {
  const { products } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const resourceName = {
    singular: "product",
    plural: "products",
  };

  const rowMarkup = products.map(
    (
      { id, title, status, metafield },
      index,
    ) => {
      const productId = id.split('/').pop();
      const requireRequest = metafield?.value === "true";

      return (
        <IndexTable.Row
          id={id}
          key={id}
          position={index}
          onClick={() => navigate(`/app/products/${productId}`)}
        >
          <IndexTable.Cell>
            <Text variant="bodyMd" fontWeight="bold" as="span">
              {title}
            </Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
            {status === "ACTIVE" ? <Badge tone="success">Active</Badge> : <Badge>Draft</Badge>}
          </IndexTable.Cell>
          <IndexTable.Cell>
            {requireRequest ? <Badge tone="warning">Restricted (Request Only)</Badge> : <Badge tone="info">Public View</Badge>}
          </IndexTable.Cell>
        </IndexTable.Row>
      );
    },
  );

  return (
    <Page title="COA Manager">
      <Layout>
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
            >
              {rowMarkup}
            </IndexTable>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
