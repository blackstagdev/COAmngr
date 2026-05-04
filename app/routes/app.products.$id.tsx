import { useState, useCallback } from "react";
import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  FormLayout,
  Checkbox,
  Button,
  TextField,
  BlockStack,
  Text,
  Divider,
  InlineStack,
  RadioButton,
  DropZone
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const productId = `gid://shopify/Product/${params.id}`;

  const response = await admin.graphql(
    `#graphql
    query Product($id: ID!) {
      product(id: $id) {
        id
        title
        requireRequest: metafield(namespace: "coa", key: "require_request") {
          id
          value
        }
        coaRecords: metafield(namespace: "coa", key: "records") {
          id
          value
        }
      }
    }`,
    { variables: { id: productId } }
  );

  const responseJson = await response.json();
  const product = responseJson.data.product;

  return json({
    product: {
      ...product,
      requireRequestValue: product.requireRequest?.value === "true",
      records: product.coaRecords ? JSON.parse(product.coaRecords.value) : []
    }
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const productId = `gid://shopify/Product/${params.id}`;
  
  const formData = await request.formData();
  const requireRequest = formData.get("requireRequest") === "true";
  const recordsStr = formData.get("records") as string;
  const records = JSON.parse(recordsStr);

  const updateResponse = await admin.graphql(
    `#graphql
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        input: {
          id: productId,
          metafields: [
            {
              namespace: "coa",
              key: "require_request",
              type: "boolean",
              value: requireRequest.toString()
            },
            {
              namespace: "coa",
              key: "records",
              type: "json",
              value: JSON.stringify(records)
            }
          ]
        }
      }
    }
  );

  return json({ success: true });
};

export default function ProductCoaManager() {
  const { product } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  const [requireRequest, setRequireRequest] = useState(product.requireRequestValue);
  const [records, setRecords] = useState<any[]>(product.records || []);

  const handleSave = () => {
    const formData = new FormData();
    formData.append("requireRequest", requireRequest.toString());
    formData.append("records", JSON.stringify(records));
    submit(formData, { method: "post" });
  };

  const handleAddRecord = () => {
    setRecords([
      ...records,
      {
        id: Math.random().toString(36).substring(7),
        imageUrl: "",
        analysis_date: "",
        lot_number: "",
        lab_name: "",
        notes: "",
        is_latest: records.length === 0
      }
    ]);
  };

  const handleRemoveRecord = (id: string) => {
    setRecords(records.filter(r => r.id !== id));
  };

  const handleRecordChange = (id: string, field: string, value: any) => {
    setRecords(records.map(r => {
      if (r.id === id) {
        if (field === "is_latest" && value === true) {
          // If this is set to latest, un-latest others
          return { ...r, is_latest: true };
        }
        return { ...r, [field]: value };
      }
      if (field === "is_latest" && value === true) {
        return { ...r, is_latest: false };
      }
      return r;
    }));
  };

  return (
    <Page
      title={`Manage COAs: ${product.title}`}
      backAction={{ content: "Products", url: "/app/coa-manager" }}
      primaryAction={{
        content: "Save",
        onAction: handleSave,
        loading: isSaving
      }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Settings</Text>
              <Checkbox
                label="Require users to request COA via email instead of viewing directly"
                checked={requireRequest}
                onChange={(checked) => setRequireRequest(checked)}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text variant="headingMd" as="h2">Certificates</Text>
                <Button onClick={handleAddRecord}>Add COA</Button>
              </InlineStack>

              {records.length === 0 ? (
                <Text as="p" tone="subdued">No certificates added yet.</Text>
              ) : (
                <BlockStack gap="500">
                  {records.map((record, index) => (
                    <div key={record.id} style={{ border: '1px solid #e1e3e5', padding: '16px', borderRadius: '8px' }}>
                      <FormLayout>
                        <InlineStack align="space-between">
                          <Text variant="headingSm" as="h3">Certificate {index + 1}</Text>
                          <Button tone="critical" variant="plain" onClick={() => handleRemoveRecord(record.id)}>Remove</Button>
                        </InlineStack>
                        
                        <RadioButton
                          label="Mark as Latest"
                          checked={record.is_latest}
                          id={`latest_${record.id}`}
                          name="is_latest"
                          onChange={() => handleRecordChange(record.id, "is_latest", true)}
                        />

                        <div style={{ marginBottom: '1rem' }}>
                          <Text as="p" fontWeight="bold">COA Image</Text>
                          <div style={{ marginTop: '8px' }}>
                            <DropZone
                              accept="image/*"
                              type="image"
                              onDrop={(_dropFiles, acceptedFiles) => {
                                if (acceptedFiles.length > 0) {
                                  const file = acceptedFiles[0];
                                  const reader = new FileReader();
                                  reader.readAsDataURL(file);
                                  reader.onload = () => {
                                    handleRecordChange(record.id, "imageUrl", reader.result as string);
                                  };
                                }
                              }}
                            >
                              {record.imageUrl ? (
                                <div style={{ padding: '16px' }}>
                                  <InlineStack gap="400" align="start">
                                    <div style={{ width: '100px', height: '100px', overflow: 'hidden', borderRadius: '4px', border: '1px solid #ddd' }}>
                                      <img src={record.imageUrl} alt="COA" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    </div>
                                    <Button onClick={(e) => { e.stopPropagation(); handleRecordChange(record.id, "imageUrl", ""); }} tone="critical" variant="plain">
                                      Remove Image
                                    </Button>
                                  </InlineStack>
                                </div>
                              ) : (
                                <DropZone.FileUpload actionTitle="Add COA Image" actionHint="Accepts .gif, .jpg, and .png" />
                              )}
                            </DropZone>
                          </div>
                        </div>
                        
                        <FormLayout.Group>
                          <TextField
                            label="Analysis Date"
                            type="date"
                            value={record.analysis_date}
                            onChange={(val) => handleRecordChange(record.id, "analysis_date", val)}
                            autoComplete="off"
                          />
                          <TextField
                            label="Lot / Batch Number"
                            value={record.lot_number}
                            onChange={(val) => handleRecordChange(record.id, "lot_number", val)}
                            autoComplete="off"
                          />
                        </FormLayout.Group>
                        
                        <TextField
                          label="Lab Name"
                          value={record.lab_name}
                          onChange={(val) => handleRecordChange(record.id, "lab_name", val)}
                          autoComplete="off"
                        />
                        
                        <TextField
                          label="Notes"
                          value={record.notes}
                          onChange={(val) => handleRecordChange(record.id, "notes", val)}
                          multiline={3}
                          autoComplete="off"
                        />
                      </FormLayout>
                    </div>
                  ))}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
