import { strict as assert } from "node:assert";
import { test } from "node:test";
import { HUB_MAX_SOURCE_BYTES, validateHubUpload } from "../../src/commerce/product-hub-upload";

test("client image preflight rejects empty, oversized and unsupported files without uploading", () => {
  assert.equal(HUB_MAX_SOURCE_BYTES, 5 * 1024 * 1024);
  assert.equal(validateHubUpload({ name: "photo.jpg", type: "image/jpeg", size: HUB_MAX_SOURCE_BYTES }), null);
  assert.match(validateHubUpload({ name: "photo.jpg", type: "image/jpeg", size: HUB_MAX_SOURCE_BYTES + 1 })!, /5 MB/);
  assert.match(validateHubUpload({ name: "empty.webp", type: "image/webp", size: 0 })!, /empty/);
  assert.match(validateHubUpload({ name: "photo.heic", type: "image/heic", size: 200 })!, /not supported/);
  for (const type of ["image/jpeg", "image/png", "image/webp", "image/avif"])
    assert.equal(validateHubUpload({ name: "photo", size: 100, type }), null);
});
