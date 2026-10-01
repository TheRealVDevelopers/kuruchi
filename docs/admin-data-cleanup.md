# Remove test data before real work

Only the Kurchi **Admin** can use these controls. Super Admin remains view-only.

1. Open **Admin → More → Manage data**.
2. Download a backup before removing records. This is a JSON export; the app does not have a one-click restore button.
3. To start fresh, choose **Review & clear data**. Review the saved record counts, type `CLEAR WORKSPACE`, and confirm.
4. To keep real projects, select only unwanted projects and choose **Delete selected**. Project cards also have **Delete project**. Type `DELETE PROJECTS` after reviewing the linked records.
5. Open **Admin → Users** to delete unwanted logins. Select users or use the row's **Delete** button, then type `DELETE USERS`.

Project deletion includes BOQ lines, shipments, invoices, advances, payments, expenses, schedules, reports and document records belonging to that project. Other projects and catalogue masters are kept.

Clearing work data also removes catalogue, BOQ kits, client organisations and partner records. It keeps user login accounts, Kurchi's legal seller/bank profile, document-number floors, and a maintenance audit record. Re-create real client/partner records and assign the relevant logins before starting a new rollout.

The signed-in Admin and the last active Admin cannot be deleted. Other Firebase accounts outside the Kurchi workspace are untouched. Historical project attributions remain when a login alone is deleted.

Uploaded files are not erased from Firebase Storage; their app records are removed. No live records are deleted merely by installing these controls.

An Admin cleanup is authoritative across devices. Edits queued before the cleanup are discarded rather than restoring deleted records. Older app tabs may need refreshing after cleanup.
