// Rules for an artist's signature examples: the labelled photos shown on their
// page. Admins and the verified artist manage them from the dashboard.

export const MAX_SIGNATURE_EXAMPLES = 8;
export const MAX_SIGNATURE_LABEL_LENGTH = 40;
export const MAX_SIGNATURE_IMAGE_BYTES = 5 * 1024 * 1024;
export const LEGACY_SIGNATURE_LABEL = 'Signature';
// Id of the not-yet-saved legacy example, which is saved for real on the
// artist's first upload. Unique per artist so client caches keyed on id don't
// mix artists up.
export const legacySignatureId = (artist: { filename?: string }) => `legacy-${artist.filename}`;

export interface StoredSignatureExample {
    _id?: unknown;
    imageUrl: string;
    key?: string;
    label: string;
    order?: number;
}

export interface SignatureExampleView {
    id: string;
    imageUrl: string;
    label: string;
}

/** Trims a label and checks its length. Throws an Error with a user-facing message. */
export function cleanSignatureLabel(raw: string | null | undefined): string {
    const label = (raw ?? '').replace(/\s+/g, ' ').trim();
    if (!label) throw new Error('Give the signature example a label, e.g. Regular or Sketch.');
    if (label.length > MAX_SIGNATURE_LABEL_LENGTH) {
        throw new Error(`Labels must be ${MAX_SIGNATURE_LABEL_LENGTH} characters or fewer.`);
    }
    return label;
}

interface SignatureArtist {
    signatureExamples?: StoredSignatureExample[];
    haveSignature?: string;
    filename?: string;
}

/**
 * The old single image (haveSignature "true") as a stored example, for artists
 * who don't have any examples yet. Null otherwise.
 */
export function legacySignatureExample(artist: SignatureArtist, cdnBaseUrl: string): StoredSignatureExample | null {
    if ((artist.signatureExamples ?? []).length > 0) return null;
    if (artist.haveSignature !== 'true' || !artist.filename) return null;
    const key = `signatures/${artist.filename}.jpg`;
    return { imageUrl: `${cdnBaseUrl}/${key}`, key, label: LEGACY_SIGNATURE_LABEL, order: 0 };
}

/**
 * The examples to show for an artist, in display order. Artists who only have
 * the old single image get it back as one example, so clients only ever deal
 * with the list.
 */
export function listSignatureExamples(artist: SignatureArtist, cdnBaseUrl: string): SignatureExampleView[] {
    const legacy = legacySignatureExample(artist, cdnBaseUrl);
    if (legacy) return [{ id: legacySignatureId(artist), imageUrl: legacy.imageUrl, label: legacy.label }];
    return [...(artist.signatureExamples ?? [])]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((e) => ({ id: String(e._id), imageUrl: e.imageUrl, label: e.label }));
}

/**
 * The new order for every example, given the full list of ids in display
 * order. Throws unless the ids are exactly the stored ones.
 */
export function reorderSignatureExamples(storedIds: string[], requestedIds: string[]): Map<string, number> {
    const stored = new Set(storedIds);
    const requested = new Set(requestedIds);
    if (requested.size !== requestedIds.length || requested.size !== stored.size || requestedIds.some((id) => !stored.has(id))) {
        throw new Error('The signature examples changed. Reload and try again.');
    }
    return new Map(requestedIds.map((id, index) => [id, index]));
}
