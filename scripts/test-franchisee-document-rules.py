"""Run isolated Firebase Rules API tests; no live documents or files are written.

Usage: python3 scripts/test-franchisee-document-rules.py --project PROJECT_ID
Requires an authenticated Firebase CLI session or FIREBASE_RULES_TEST_TOKEN.
"""
import argparse
import copy
import json
import os
from pathlib import Path
import urllib.request


def cases(storage=False):
    now = "2026-10-15T20:00:00Z"
    metadata = {
        "category": "KURCHI_KYC", "name": "Company GST", "originalName": "gst.pdf",
        "fileUrl": "https://firebasestorage.googleapis.com/v0/b/example/o/gst.pdf?alt=media",
        "storagePath": "franchisee-library/KURCHI_KYC/doc1/gst.pdf",
        "contentType": "application/pdf", "size": 2048,
        "uploadedBy": "Kurchi Admin", "uploadedByUid": "admin1", "uploadedAt": now, "updatedAt": now,
    }
    path = ("/b/example/o/franchisee-library/KURCHI_KYC/doc1/gst.pdf" if storage
            else "/databases/(default)/documents/franchiseeLibraryDocuments/doc1")
    tests = []

    def add(label, method, role, allowed, change=None, active=True, member=True, category=None):
        data = {"size": 2048, "contentType": "application/pdf"} if storage else copy.deepcopy(metadata)
        if change:
            data.update(change)
        request = {"path": path, "method": method, "time": now}
        if category:
            request["path"] = path.replace("KURCHI_KYC", category)
        if role:
            request["auth"] = {"uid": "admin1", "token": {"role": role, "active": active}}
        if method in ("create", "update"):
            request["resource"] = data if storage else {"data": data}
        case = {"expectation": "ALLOW" if allowed else "DENY", "request": request}
        if method != "create":
            case["resource"] = {"size": 2048, "contentType": "application/pdf"} if storage else {"data": metadata}
        if not storage:
            case["functionMocks"] = [{"function": "get", "args": [{"anyValue": {}}],
                                      "result": {"value": {"data": {"active": member}}}}]
        tests.append((label, case))

    for role in ("ADMIN", "VENDOR", "CLIENT", "ACCOUNTS", "SUPER_ADMIN", None):
        add(f"{role}: read", "get", role, role in ("ADMIN", "VENDOR"))
        add(f"{role}: create", "create", role, role == "ADMIN")
        add(f"{role}: delete", "delete", role, role == "ADMIN")
    add("inactive admin read", "get", "ADMIN", False, active=False)
    add("inactive admin upload", "create", "ADMIN", False, active=False)
    add("inactive vendor read", "get", "VENDOR", False, active=False)
    add("PDF size at limit", "create", "ADMIN", True, {"size": 10 * 1024 * 1024})
    add("oversized PDF", "create", "ADMIN", False, {"size": 10 * 1024 * 1024 + 1})
    add("empty PDF", "create", "ADMIN", False, {"size": 0})
    for mime in ("image/jpeg", "image/png", "image/webp", "image/gif"):
        add(mime, "create", "ADMIN", True, {"contentType": mime})
    for mime in ("image/svg+xml", "text/html", "application/javascript"):
        add(mime, "create", "ADMIN", False, {"contentType": mime})
    if storage:
        add("manual upload", "create", "ADMIN", True, category="INSTRUCTION_MANUAL")
        add("unknown category", "create", "ADMIN", False, category="CUSTOM")
        add("unknown category read", "get", "VENDOR", False, category="CUSTOM")
        add("no overwrite", "update", "ADMIN", False)
        add("vendor cannot overwrite", "update", "VENDOR", False)
    else:
        add("revoked member read", "get", "VENDOR", False, member=False)
        add("revoked member upload", "create", "ADMIN", False, member=False)
        add("manual upload", "create", "ADMIN", True, {"category": "INSTRUCTION_MANUAL", "storagePath": "franchisee-library/INSTRUCTION_MANUAL/doc1/gst.pdf"})
        add("unknown category", "create", "ADMIN", False, {"category": "CUSTOM"})
        for name in ("", "   ", "x" * 161):
            add("invalid name", "create", "ADMIN", False, {"name": name})
        for changes in ({"uploadedByUid": "other"}, {"storagePath": "another/file.pdf"},
                        {"fileUrl": "javascript:alert(1)"}, {"extra": "field"},
                        {"uploadedAt": "2000-01-01T00:00:00Z"}):
            add("invalid metadata " + next(iter(changes)), "create", "ADMIN", False, changes)
        add("rename", "update", "ADMIN", True, {"name": "Updated GST"})
        add("vendor cannot rename", "update", "VENDOR", False, {"name": "Changed"})
        add("blank rename", "update", "ADMIN", False, {"name": " "})
        for field, value in (("category", "INSTRUCTION_MANUAL"), ("fileUrl", "https://example.com/file"),
                             ("size", 100), ("uploadedByUid", "other"), ("storagePath", "elsewhere")):
            add("immutable " + field, "update", "ADMIN", False, {field: value})
    return tests


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    args = parser.parse_args()
    token = os.environ.get("FIREBASE_RULES_TEST_TOKEN")
    if not token:
        config = Path.home() / ".config/configstore/firebase-tools.json"
        token = json.loads(config.read_text())["tokens"]["access_token"]
    root = Path(__file__).resolve().parents[1]
    total = 0
    for file in ("firestore.rules", "storage.rules"):
        suite = cases(storage=file == "storage.rules")
        body = {"source": {"files": [{"name": file, "content": (root / file).read_text()}]},
                "testSuite": {"testCases": [case for _, case in suite]}}
        request = urllib.request.Request(
            f"https://firebaserules.googleapis.com/v1/projects/{args.project}:test",
            data=json.dumps(body).encode(), headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=60) as response:
            result = json.load(response)
        failures = [{"case": suite[i][0], "result": row} for i, row in enumerate(result.get("testResults", [])) if row["state"] != "SUCCESS"]
        if result.get("issues") or failures or len(result.get("testResults", [])) != len(suite):
            raise SystemExit(json.dumps({"file": file, "issues": result.get("issues"), "failures": failures}, indent=2))
        print(f"{file}: {len(suite)} permission tests passed")
        total += len(suite)
    print(f"{total} permission tests passed; no live data changed.")


if __name__ == "__main__":
    main()
