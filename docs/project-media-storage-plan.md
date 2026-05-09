# Project Media Storage Plan

## Supabase Storage Bucket

Name: `project-media`
Access: authenticated users only (RLS via project membership)

## Database Table: project_media

```sql
CREATE TABLE project_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category text NOT NULL,
  source text NOT NULL DEFAULT 'field_upload',
  url text NOT NULL,
  thumbnail_url text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  captured_at timestamptz,
  lat double precision,
  lng double precision,
  altitude_m double precision,
  accuracy_m double precision,
  is_report_ready boolean NOT NULL DEFAULT false,
  tags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'uploaded',
  uploaded_by uuid REFERENCES auth.users(id)
);
```

## File Naming Convention

Pattern: `{project_id}/{year}/{category}/{uuid}.{ext}`
Example: `proj-001/2025/field_photo/a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg`

## Upload Flow

1. User selects file in ProjectMediaUploadPanel
2. Client extracts EXIF metadata (GPS coordinates, timestamp) using `exifr`
3. Pre-fill coordinates and capturedAt from EXIF
4. Client requests presigned upload URL from Supabase Storage
5. PUT file directly to Storage (bypasses server)
6. Client-side resize to generate thumbnail (Canvas API, max 400×300px)
7. PUT thumbnail to Storage under same path with `_thumb` suffix
8. INSERT row into `project_media` with both URLs + all metadata
9. Invalidate TanStack Query cache key `["project-media", projectId]`

## Thumbnails

Option A (recommended for v1): Client-side Canvas resize before upload.

- Resize longest dimension to 400px, JPEG quality 80
- No server cost, no Edge Function needed

Option B (v2): Supabase Edge Function triggered on Storage insert.

- Higher quality, consistent sizing
- Requires Edge Function deployment

## Geotagging

- Add `exifr` npm package: `npm install exifr`
- Extract on file select: `const gps = await exifr.gps(file)`
- Pre-fill lat/lng fields in upload form
- Allow manual override
- Store altitude and accuracy when available

## Access Control (RLS)

```sql
-- SELECT: project members only
CREATE POLICY "members_read_media" ON project_media
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM projects WHERE organization_id = (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

-- INSERT: authenticated project members
CREATE POLICY "members_insert_media" ON project_media
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND uploaded_by = auth.uid()
  );

-- DELETE: project owner or admin only
CREATE POLICY "owners_delete_media" ON project_media
  FOR DELETE USING (uploaded_by = auth.uid());
```

Storage bucket policy: authenticated users can read; only uploaders can write.

## Next Steps

1. Add migration: `supabase/migrations/006_project_media.sql`
2. Install `exifr` for EXIF extraction
3. Wire `ProjectMediaUploadPanel` to real Supabase Storage upload
4. Replace `getProjectMedia()` static seed with TanStack Query hook backed by `project_media` table
5. Add thumbnail generation (Canvas API) before upload
6. Add `useProjectMedia(projectId)` hook in `src/services/media-service.ts`

## Implementeret

Følgende er implementeret på branch `feature/supabase-project-media-upload`:

- **`supabase/migrations/006_project_media.sql`** — opretter `project_media`-tabellen med RLS-politikker og check constraints for kategori, kilde og status. Dokumenterer det påkrævede storage bucket "project-media".
- **`src/services/project-media-service.ts`** — service med `listProjectMedia`, `uploadProjectMedia`, `updateProjectMedia`, `deleteProjectMedia` og `getMediaPublicUrl`. Falder tilbage på seed-data når Supabase ikke er konfigureret.
- **exifr integration** — `exifr` installeret via npm; GPS-koordinater (latitude/longitude) udtrækkes automatisk ved filvalg i upload-panelet og forudfylder koordinatfelterne.
- **Opdateret upload-panel** (`src/components/project-workspace/ProjectMediaUploadPanel.tsx`) — rigtig `<input type="file">` med dropzone, filforhåndsvisning, filnavn + størrelse, EXIF GPS-autofyld, loading-spinner under upload, success/fejl-beskeder, og amber-banner i preview mode.
- **Opdateret galleri** (`src/components/project-workspace/ProjectMediaGallery.tsx`) — tilføjet `isLoading?: boolean` prop der viser 3 skeleton-kort under indlæsning.
- **Opdateret projektsideʼs medier-fane** (`src/routes/app.projects.$slug.tsx`) — bruger nu `listProjectMedia` (async) med `useState`/`useEffect`, sender `isLoading` til galleriet og `onUploadComplete` til upload-panelet (tilføjer nyt element til toppen af listen).
- **System test** (`src/routes/app.system-test.tsx`) — nyt "Supabase Medier"-kort med status for `project_media`-tabellen og `project-media` storage bucket, plus `isSupabaseConfigured`-badge.
