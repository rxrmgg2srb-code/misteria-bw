const token = process.argv[2];

async function testFetch() {
  console.log("Testing fetch with token:", token ? "provided" : "none");
  try {
    const res = await fetch("https://api.biwenger.com/v2/user?fields=squad,lineup,money", {
      headers: {
        "X-Session-Token": token || "",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Origin": "https://biwenger.as.com",
        "Referer": "https://biwenger.as.com/"
      }
    });
    console.log("Status:", res.status);
    const body = await res.text();
    console.log("Body length:", body.length);
    console.log("Body preview:", body.substring(0, 100));
  } catch (err) {
    console.error("Fetch error:", err.message);
    if (err.cause) {
      console.error("Cause:", err.cause);
    }
  }
}

testFetch();
