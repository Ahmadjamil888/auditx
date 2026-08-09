// ─── Regression tests for safeParseJSON ───────────────────────────────────────────
// Tests edge cases: valid JSON, embedded newlines, unescaped quotes, markdown fences, partial JSON

// Since we don't have a test framework set up, this file documents the test cases
// that should be added when a test framework (vitest/jest) is integrated.

/*
Test cases for safeParseJSON:

1. Valid JSON object (happy path)
   Input: '{"ticker":"OGDC","action":"BUY","quantity":100}'
   Expected: Successfully parsed object

2. JSON with markdown fences
   Input: '```json\n{"ticker":"OGDC","action":"BUY"}\n```'
   Expected: Successfully parsed object (fences stripped)

3. JSON with markdown fences (json label omitted)
   Input: '```\n{"ticker":"OGDC","action":"BUY"}\n```'
   Expected: Successfully parsed object (fences stripped)

4. JSON with embedded literal newline (should fail first, then fallback)
   Input: '{"ticker":"OGDC","description":"This is a test\nwith newline"}'
   Expected: Fallback handles escaped newlines

5. JSON with unescaped quote in string value (should fail first, then fallback)
   Input: '{"ticker":"OGDC","description":"He said "hello""}'
   Expected: Fallback handles escaped quotes

6. Partial/truncated JSON (incomplete object)
   Input: '{"ticker":"OGDC","action'
   Expected: Throws error with useful message about truncation

7. Empty response
   Input: ''
   Expected: Throws error

8. JSON with extra whitespace
   Input: '  {"ticker":"OGDC","action":"BUY"}  '
   Expected: Successfully parsed (whitespace trimmed)

9. JSON with newlines between fields (valid JSON)
   Input: '{"ticker":"OGDC",\n"action":"BUY"}'
   Expected: Successfully parsed

10. JSON with unicode characters
    Input: '{"ticker":"OGDC","description":"PKR ₹ 1000"}'
    Expected: Successfully parsed

Implementation notes:
- The parser should try normal JSON.parse first
- On failure, it should log the raw offending string
- It should attempt common fixes (escape quotes, escape newlines)
- If all fixes fail, it should throw a descriptive error
- For partial JSON, it should detect truncation and report it clearly
*/
