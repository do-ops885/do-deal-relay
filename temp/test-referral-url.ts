/**
 * Test script for referral URL parsing
 * Tests with real URL: https://de.scalable.capital/en/invitation/b6zk2z
 */

// Inline the parseReferralUrl function for testing
interface ParsedReferralUrl {
  url: string;
  domain: string;
  code: string;
  path: string;
}

function parseReferralUrl(input: string): ParsedReferralUrl | null {
  try {
    // Ensure it starts with protocol
    let urlStr = input.trim();
    if (!urlStr.startsWith("http://") && !urlStr.startsWith("https://")) {
      urlStr = "https://" + urlStr;
    }

    const url = new URL(urlStr);
    const domain = url.hostname.replace(/^www\./, "");
    const path = url.pathname;

    // Extract code from path (last segment after last /)
    const segments = path.split("/").filter((s) => s.length > 0);
    const lastSegment = segments[segments.length - 1] || "";

    // Code should be alphanumeric and at least 4 chars
    const codeMatch = lastSegment.match(/^[A-Z0-9]{4,}$/i);
    const code = codeMatch ? codeMatch[0].toUpperCase() : lastSegment;

    if (!code || code.length < 3) {
      return null;
    }

    return { url: urlStr, domain, code, path };
  } catch {
    return null;
  }
}

// Test URLs
const testUrls = [
  // Real Scalable Capital URL
  "https://de.scalable.capital/en/invitation/b6zk2z",
  // Other test cases
  "https://picnic.app/de/freunde-rabatt/DOMI6869",
  "https://example.com/invite/ABC123",
  // Edge cases
  "de.scalable.capital/en/invitation/b6zk2z", // Without protocol
  "https://www.scalable.capital/invitation/b6zk2z", // With www
];

console.log("Testing Referral URL Parsing\n");
console.log("=" .repeat(60));

for (const url of testUrls) {
  console.log(`\nInput: ${url}`);
  const parsed = parseReferralUrl(url);
  
  if (parsed) {
    console.log("✅ SUCCESS");
    console.log(`  Full URL: ${parsed.url}`);
    console.log(`  Domain: ${parsed.domain}`);
    console.log(`  Code: ${parsed.code}`);
    console.log(`  Path: ${parsed.path}`);
    
    // Verify URL preservation
    const urlPreserved = parsed.url === url || 
      (parsed.url === `https://${url}` && !url.startsWith("http"));
    console.log(`  URL Preserved: ${urlPreserved ? "✅" : "❌"}`);
    
    // Verify code extraction
    const expectedCode = url.split("/").pop()?.toUpperCase();
    const codeCorrect = parsed.code === expectedCode;
    console.log(`  Code Correct: ${codeCorrect ? "✅" : "❌"} (expected: ${expectedCode})`);
  } else {
    console.log("❌ FAILED - Could not parse URL");
  }
}

console.log("\n" + "=".repeat(60));
console.log("\nTest Summary:");
console.log(`- Scalable Capital URL (b6zk2z): ${parseReferralUrl("https://de.scalable.capital/en/invitation/b6zk2z") ? "✅ PASS" : "❌ FAIL"}`);
console.log(`- Picnic URL (DOMI6869): ${parseReferralUrl("https://picnic.app/de/freunde-rabatt/DOMI6869") ? "✅ PASS" : "❌ FAIL"}`);
console.log(`- Simple URL (ABC123): ${parseReferralUrl("https://example.com/invite/ABC123") ? "✅ PASS" : "❌ FAIL"}`);

// Specific verification for the Scalable Capital URL
console.log("\n" + "=".repeat(60));
console.log("\nDetailed Verification for Scalable Capital URL:");
const scalable = parseReferralUrl("https://de.scalable.capital/en/invitation/b6zk2z");
if (scalable) {
  console.log(`✅ Code extracted correctly: "${scalable.code}"`);
  console.log(`✅ Domain extracted correctly: "${scalable.domain}"`);
  console.log(`✅ Full URL preserved: "${scalable.url}"`);
  console.log(`\n📋 This URL can be used with the CLI:`);
  console.log(`   refcli codes smart-add "${scalable.url}"`);
  console.log(`\n📋 Or with explicit parameters:`);
  console.log(`   refcli codes add --code ${scalable.code} --url "${scalable.url}" --domain ${scalable.domain}`);
} else {
  console.log("❌ CRITICAL: Could not parse the Scalable Capital URL!");
  console.log("   This would prevent users from adding this referral code.");
}
