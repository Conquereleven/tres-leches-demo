import test from "node:test";
import assert from "node:assert/strict";
import { byteRange } from "../../server/static-range";

test("byte ranges: whole file, bounded, open-ended, suffix and unsatisfiable", () => {
  assert.deepEqual(byteRange(undefined, 100), { status: 200 });
  assert.deepEqual(byteRange("bytes=0-1", 100), {
    status: 206,
    start: 0,
    end: 1,
  });
  assert.deepEqual(byteRange("bytes=10-", 100), {
    status: 206,
    start: 10,
    end: 99,
  });
  assert.deepEqual(byteRange("bytes=90-500", 100), {
    status: 206,
    start: 90,
    end: 99,
  });
  assert.deepEqual(byteRange("bytes=-20", 100), {
    status: 206,
    start: 80,
    end: 99,
  });
  assert.deepEqual(byteRange("bytes=-500", 100), {
    status: 206,
    start: 0,
    end: 99,
  });
  assert.deepEqual(byteRange("bytes=100-", 100), { status: 416 });
  assert.deepEqual(byteRange("bytes=50-10", 100), { status: 416 });
  assert.deepEqual(byteRange("bytes=-0", 100), { status: 416 });
  // Anything we do not understand is answered with the whole file, never an error.
  for (const odd of ["bytes=0-1,5-9", "items=0-1", "bytes=a-b", "bytes=-"])
    assert.deepEqual(byteRange(odd, 100), { status: 200 });
});
