# Compose editor and attachments

The compose screen will show parsed recipients as compact chips. It will display the first three addresses and a `+N` chip for the remainder, while keeping every address in the outgoing request. Users can remove visible chips, add a recipient by pressing Enter, and upload CSV or TXT lead lists. The count remains visible beside the upload action.

The message editor will use a semantic `contenteditable` region and a keyboard-accessible toolbar. It supports undo, redo, headings, bold, italic, underline, block quotes, ordered and unordered lists, indentation, links, and alignment. The browser creates the editor HTML; the API sanitizes it to a small safe set of mail-friendly elements before it is stored and sent. A plain-text fallback is derived for mail clients that cannot render HTML.

Attachments are stored in PostgreSQL so scheduled work survives API and worker restarts. The upload endpoint accepts a binary file, verifies the authenticated owner, limits a file to 8 MB, and records its MIME type and bytes. A batch may reference uploaded attachments owned by the current user, up to 25 MB in total. The worker retrieves those attachments and sends them through Nodemailer. The compose screen previews selected image, audio, video, and generic-file attachments and allows removal before scheduling.

The implementation keeps attachments independent until the batch is created. This avoids orphaned mail content being attached to another user's batch and lets the frontend retry a failed schedule request without re-uploading files. Uploads that are never used remain user-owned database records; a future retention process can remove stale uploads if storage becomes a concern.
