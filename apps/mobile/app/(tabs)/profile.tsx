import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Button, Card, Text, TextField } from '@estate/ui';
import { Screen } from '../../src/components/Screen';
import { apiFetch } from '../../src/lib/api';
import { clearSession } from '../../src/lib/storage';

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  PROOF_OF_FUNDS: 'Proof of Funds',
  MORTGAGE_APPROVAL: 'Mortgage Approval',
  PROOF_OF_IDENTITY: 'Photo ID',
  PROOF_OF_ADDRESS: 'Proof of Address',
  SOURCE_OF_FUNDS: 'Source of Funds',
  SOLICITOR_DETAILS: 'Solicitor Details',
  OTHER: 'Other',
};

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export default function ProfileScreen() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);

  const [requirements, setRequirements] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [selectedType, setSelectedType] = useState('PROOF_OF_FUNDS');
  const [documentTitle, setDocumentTitle] = useState('Proof of Funds');
  const [notes, setNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState<{ name: string; uri: string; mimeType?: string; size?: number } | null>(null);

  const [loadingDocs, setLoadingDocs] = useState(false);
  const [submittingDoc, setSubmittingDoc] = useState(false);
  const [docMessage, setDocMessage] = useState('');

  const [agentDocs, setAgentDocs] = useState<any[]>([]);
  const [loadingAgentDocs, setLoadingAgentDocs] = useState(false);
  const [agentMessage, setAgentMessage] = useState('');

  async function loadProfile() {
    const profile = await apiFetch('/me').then((r) => r.json());
    setMe(profile);
  }

  async function loadBuyerDocuments() {
    setLoadingDocs(true);
    setDocMessage('');
    try {
      const [requirementsRes, documentsRes] = await Promise.all([apiFetch('/me/document-requirements'), apiFetch('/me/documents')]);
      const [requirementsData, documentsData] = await Promise.all([requirementsRes.json(), documentsRes.json()]);
      if (requirementsRes.ok) setRequirements(Array.isArray(requirementsData) ? requirementsData : []);
      if (documentsRes.ok) setDocuments(Array.isArray(documentsData) ? documentsData : []);
    } catch {
      setDocMessage('Could not load document checklist');
    } finally {
      setLoadingDocs(false);
    }
  }

  async function loadAgentDocuments() {
    setLoadingAgentDocs(true);
    setAgentMessage('');
    try {
      const res = await apiFetch('/buyer-documents');
      const data = await res.json();
      if (!res.ok) {
        setAgentMessage(data?.message ?? 'Could not load buyer documents');
        return;
      }
      setAgentDocs(Array.isArray(data) ? data : []);
    } catch {
      setAgentMessage('Could not load buyer documents');
    } finally {
      setLoadingAgentDocs(false);
    }
  }

  async function chooseFile() {
    setDocMessage('');
    const result = await DocumentPicker.getDocumentAsync({
      multiple: false,
      copyToCacheDirectory: true,
      type: ['application/pdf', 'image/*', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    });
    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    if (asset.size && asset.size > MAX_UPLOAD_BYTES) {
      setDocMessage(`File too large. Max ${(MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(0)}MB`);
      return;
    }

    setSelectedFile({
      name: asset.name,
      uri: asset.uri,
      mimeType: asset.mimeType ?? 'application/octet-stream',
      size: asset.size,
    });
  }

  async function submitDocument() {
    if (!documentTitle.trim()) {
      setDocMessage('Please enter a document title');
      return;
    }
    if (!selectedFile) {
      setDocMessage('Please choose a file to upload');
      return;
    }

    setDocMessage('');
    setSubmittingDoc(true);

    try {
      const dataBase64 = await FileSystem.readAsStringAsync(selectedFile.uri, { encoding: FileSystem.EncodingType.Base64 });
      const res = await apiFetch('/me/documents/upload', {
        method: 'POST',
        body: JSON.stringify({
          documentType: selectedType,
          documentTitle: documentTitle.trim(),
          notes: notes.trim() || undefined,
          fileName: selectedFile.name,
          mimeType: selectedFile.mimeType ?? 'application/octet-stream',
          dataBase64,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDocMessage(data?.message ?? 'Could not submit document');
        return;
      }

      setNotes('');
      setSelectedFile(null);
      setDocMessage('Document uploaded successfully');
      await loadBuyerDocuments();
    } catch {
      setDocMessage('Could not upload document');
    } finally {
      setSubmittingDoc(false);
    }
  }

  async function openDocumentFile(documentId: string, fallbackName = 'document.bin') {
    try {
      const res = await apiFetch(`/buyer-documents/${documentId}/file-content`);
      const data = await res.json();
      if (!res.ok) {
        setAgentMessage(data?.message ?? 'Could not load document file');
        return;
      }

      const cacheDir = FileSystem.cacheDirectory ?? '';
      const safeName = String(data.fileName || fallbackName).replace(/[^a-zA-Z0-9._-]/g, '_');
      const localPath = `${cacheDir}${Date.now()}-${safeName}`;
      await FileSystem.writeAsStringAsync(localPath, data.dataBase64, { encoding: FileSystem.EncodingType.Base64 });

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        setAgentMessage(`File saved to ${localPath}`);
        return;
      }

      await Sharing.shareAsync(localPath, {
        mimeType: data.mimeType ?? 'application/octet-stream',
        dialogTitle: data.fileName ?? safeName,
      });
    } catch {
      setAgentMessage('Could not open document file');
    }
  }

  async function markReceived(documentId: string) {
    setAgentMessage('');
    try {
      const res = await apiFetch(`/buyer-documents/${documentId}/mark-received`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setAgentMessage(data?.message ?? 'Could not mark document as received');
        return;
      }
      setAgentDocs((prev) => prev.map((row) => (row.id === documentId ? data : row)));
    } catch {
      setAgentMessage('Could not mark document as received');
    }
  }

  useEffect(() => {
    loadProfile();
  }, []);

  useEffect(() => {
    if (me?.role === 'BUYER') loadBuyerDocuments();
    if (me?.role === 'AGENT' || me?.role === 'TENANT_ADMIN') loadAgentDocuments();
  }, [me?.role]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <Card style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 22, fontWeight: '700' }}>Profile</Text>
          <Text style={{ marginTop: 8 }}>Name: {me?.name}</Text>
          <Text>Email: {me?.email}</Text>
          <Text>Role: {me?.role}</Text>
        </Card>

        {me?.role === 'BUYER' ? (
          <Card style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 22, fontWeight: '700' }}>Buyer Documents</Text>
            <Text style={{ marginTop: 8, color: '#5B5E66' }}>
              Upload proof of funds and related documents for agent/vendor review.
            </Text>

            <Text style={{ marginTop: 12, fontWeight: '600' }}>Required checklist</Text>
            {loadingDocs ? <Text style={{ marginTop: 6, color: '#5B5E66' }}>Loading checklist...</Text> : null}
            {requirements.map((item) => (
              <Text key={item.documentType} style={{ marginTop: 6, color: '#5B5E66' }}>
                - {item.title}
              </Text>
            ))}

            <Text style={{ marginTop: 14, fontWeight: '600' }}>Document type</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                <Pressable
                  key={value}
                  onPress={() => {
                    setSelectedType(value);
                    setDocumentTitle(label);
                  }}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: selectedType === value ? '#1E6BFF' : '#D8DCE4',
                    backgroundColor: selectedType === value ? '#E8F0FF' : '#FFFFFF',
                  }}
                >
                  <Text style={{ color: selectedType === value ? '#1E6BFF' : '#5B5E66' }}>{label}</Text>
                </Pressable>
              ))}
            </View>

            <View style={{ height: 10 }} />
            <TextField value={documentTitle} onChangeText={setDocumentTitle} placeholder="Document title" />
            <View style={{ height: 8 }} />
            <TextField value={notes} onChangeText={setNotes} placeholder="Optional note" />
            <View style={{ height: 8 }} />
            <Button label={selectedFile ? `Selected: ${selectedFile.name}` : 'Choose File'} onPress={chooseFile} />

            {docMessage ? (
              <Text style={{ marginTop: 8, color: docMessage.includes('successfully') ? '#30B07A' : '#D64545' }}>{docMessage}</Text>
            ) : null}

            <View style={{ height: 10 }} />
            <Button label={submittingDoc ? 'Uploading...' : 'Upload Document'} onPress={submitDocument} disabled={submittingDoc} />

            <Text style={{ marginTop: 14, fontWeight: '600' }}>Submitted documents</Text>
            {!documents.length ? <Text style={{ marginTop: 6, color: '#5B5E66' }}>No documents submitted yet.</Text> : null}
            {documents.map((doc) => (
              <View key={doc.id} style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#EEF1F6' }}>
                <Text style={{ fontWeight: '600' }}>
                  {doc.documentTitle} ({DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType})
                </Text>
                <Text style={{ marginTop: 4, color: '#5B5E66' }}>
                  Status: {doc.status ?? 'SUBMITTED'} | {new Date(doc.createdAt).toLocaleString()}
                </Text>
                <View style={{ marginTop: 8 }}>
                  <Button label="View / Download" onPress={() => openDocumentFile(doc.id, doc.fileName ?? 'document.bin')} />
                </View>
              </View>
            ))}
          </Card>
        ) : null}

        {me?.role === 'AGENT' || me?.role === 'TENANT_ADMIN' ? (
          <Card style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 22, fontWeight: '700' }}>Buyer Documents Review</Text>
            <Text style={{ marginTop: 8, color: '#5B5E66' }}>Review uploaded buyer documents and mark them as received.</Text>
            {loadingAgentDocs ? <Text style={{ marginTop: 8, color: '#5B5E66' }}>Loading buyer documents...</Text> : null}
            {agentMessage ? <Text style={{ marginTop: 8, color: '#D64545' }}>{agentMessage}</Text> : null}

            {!loadingAgentDocs && !agentDocs.length ? <Text style={{ marginTop: 8, color: '#5B5E66' }}>No buyer documents uploaded yet.</Text> : null}

            {agentDocs.map((doc) => (
              <View key={doc.id} style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#EEF1F6' }}>
                <Text style={{ fontWeight: '700' }}>{doc.documentTitle}</Text>
                <Text style={{ marginTop: 4, color: '#5B5E66' }}>
                  Buyer: {doc.buyerName ?? 'Unknown'} ({doc.buyerEmail ?? 'n/a'})
                </Text>
                <Text style={{ marginTop: 2, color: '#5B5E66' }}>
                  Type: {DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType} | Status: {doc.status}
                </Text>
                <Text style={{ marginTop: 2, color: '#5B5E66' }}>{new Date(doc.createdAt).toLocaleString()}</Text>
                <View style={{ marginTop: 8, gap: 8 }}>
                  <Button label="View / Download" onPress={() => openDocumentFile(doc.id, doc.fileName ?? 'document.bin')} />
                  <Button label="Mark Received" onPress={() => markReceived(doc.id)} disabled={doc.status === 'RECEIVED'} />
                </View>
              </View>
            ))}
          </Card>
        ) : null}

        <Button
          label="Sign Out"
          onPress={async () => {
            await clearSession();
            router.replace('/login');
          }}
        />
      </ScrollView>
    </Screen>
  );
}
