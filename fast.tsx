// Utility function to simulate network latency
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Example 1: Simple mock async function that simulates a slow API response
async function mockSlowApiCall(): Promise<{ data: string; timestamp: number }> {
  // Simulate 3-7 seconds of latency (randomized for realism)
  const latency = Math.floor(Math.random() * 4000) + 3000;
  await delay(latency);

  // Return mock data
  return {
    data: "This is mock data from a slow endpoint",
    timestamp: Date.now(),
  };
}

// Example usage
mockSlowApiCall()
  .then(result => {
    console.log("Received response:", result);
    console.log(`Response took ~${(Date.now() - result.timestamp)}ms (including processing)`);
  })
  .catch(err => console.error("Error:", err));
