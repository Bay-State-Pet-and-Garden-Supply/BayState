# File Upload Standard

## Overview
The `FileUpload` component provides a consistent, user-friendly interface for file selection and drag-and-drop operations across the application. Unlike `ImageUpload`, which handles immediate upload to storage, `FileUpload` is designed for selecting files for processing (e.g., parsing Excel files, bulk imports) where the file is handled by a client-side action or form submission.

This component standardizes the "drop zone" UI pattern, ensuring visual consistency between media uploads and data imports.

## Component API

### `FileUpload`

**Location:** `components/ui/file-upload.tsx`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onFileSelect` | `(file: File \| null) => void` | **Required** | Callback when file is selected or removed |
| `accept` | `string` | `undefined` | Native input accept attribute (e.g., ".xlsx, .pdf") |
| `maxSize` | `number` | `10` | Maximum file size in MB |
| `loading` | `boolean` | `false` | Shows loading spinner overlay and disables interaction |
| `label` | `ReactNode` | Default UI | Custom label content inside drop zone |
| `selectedFile` | `File \| null` | `undefined` | Controlled state for current file |
| `disabled` | `boolean` | `false` | Disables interaction |
| `className` | `string` | `undefined` | Additional classes for the container |

## Visual Standards

### 1. Drop Zone States
The component uses Tailwind CSS for state-driven styling:
- **Idle:** `bg-gray-50 border-gray-300` (Hover: `bg-gray-100`)
- **Drag Over:** `bg-purple-50 border-purple-500` (Active user feedback)
- **Loading:** Shows `Loader2` spinner with "Processing..." text
- **File Selected:** Shows file icon, name, size, and "Remove" button

### 2. Typography
- **Primary Action:** "Click to upload" in `text-purple-600 font-semibold`
- **Secondary Text:** "or drag and drop" in `text-gray-600`
- **Helper Text:** File type restrictions in `text-gray-500 uppercase`

## Usage Example

### Basic Implementation
```tsx
import { useState } from 'react';
import { FileUpload } from '@/components/ui/file-upload';

export function MyComponent() {
  const [file, setFile] = useState<File | null>(null);

  const handleProcess = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    // ... send to server
  };

  return (
    <FileUpload
      onFileSelect={setFile}
      selectedFile={file}
      accept=".pdf,.docx"
      maxSize={5}
      label="Upload Document"
    />
  );
}
```

## Reference Implementation: SyncClient
The `SyncClient` (`app/admin/tools/integra-sync/SyncClient.tsx`) demonstrates the ideal implementation pattern for data processing tools.

### Key Patterns Used:
1.  **Controlled State:** Manages `file` state in the parent component to enable/disable the "Analyze" button.
2.  **Custom Label:** Overrides the default label to provide specific context ("Excel files (.xlsx, .xls)").
3.  **Loading State:** Passes `isAnalyzing` state to `loading` prop to prevent user interaction during processing.
4.  **Feedback Loop:** Uses `sonner` for success/error toasts based on processing result.

```tsx
// Example from SyncClient.tsx
<FileUpload
    onFileSelect={handleFileChange}
    accept=".xlsx, .xls"
    maxSize={20}
    loading={isAnalyzing}
    selectedFile={file}
    label={
        <>
            <span className="font-semibold text-purple-600">Click to upload</span> or drag and drop
            <div className="text-xs text-gray-500 font-normal mt-1">
                Excel files (.xlsx, .xls)
            </div>
        </>
    }
/>
```

## Alignment with ImageUpload

While `FileUpload` and `ImageUpload` share similar visual cues, they serve different architectural purposes.

| Feature | `FileUpload` | `ImageUpload` |
|---------|--------------|---------------|
| **Location** | `components/ui/file-upload.tsx` | `components/admin/image-upload.tsx` |
| **Purpose** | Generic file selection for processing | Image asset management |
| **Action** | Selects file (Parent handles logic) | Uploads immediately to Supabase Storage |
| **Preview** | File Icon + Name + Size | Image Thumbnail |
| **Size Prop** | `maxSize` (MB) | `maxSizeMB` (MB) |
| **Output** | `File` object | URL string |

### Selection Guide
- Use **`FileUpload`** when:
    - Importing data (CSV, Excel, JSON)
    - Attaching documents (PDFs)
    - The file needs to be processed by an API route before storage
    - You need to validate the file content before accepting it

- Use **`ImageUpload`** when:
    - Uploading product photos
    - Uploading brand logos
    - Setting up banner images
    - You need an immediate URL for an `<img>` tag
